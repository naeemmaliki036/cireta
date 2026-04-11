"""Wallet management service."""

from __future__ import annotations

import logging
from uuid import UUID

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

MAX_WALLETS_PER_INVESTOR = settings.max_wallets_per_investor


def verify_wallet_signature(address: str, signature: str, nonce: str) -> bool:
    """Verify SIWE-style wallet signature."""
    try:
        message = encode_defunct(text=f"I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: {nonce}")
        recovered = Account.recover_message(message, signature=signature)
        return recovered.lower() == address.lower()
    except Exception as e:
        logger.warning("Signature verification failed: %s", e)
        return False


class WalletService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_wallets(self, user_id: UUID) -> list[Wallet]:
        result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.linked_at)
        )
        return list(result.scalars().all())

    async def link_wallet(
        self,
        user_id: UUID,
        address: str,
        signature: str,
        nonce: str,
        is_safe: bool = False,
        label: str | None = None,
    ) -> Wallet:
        # Verify ownership — Safe wallets use on-chain owner check, EOA uses ecrecover
        if is_safe or signature == "safe":
            is_safe = True
            await self._verify_safe_ownership(user_id, address)
        elif not verify_wallet_signature(address, signature, nonce):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_SIGNATURE",
                    "message": "Wallet signature verification failed",
                },
            )

        # Check not already linked
        from web3 import Web3

        checksum = Web3.to_checksum_address(address)
        existing = await self.db.execute(select(Wallet).where(Wallet.address_checksum == checksum))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "WALLET_EXISTS", "message": "Wallet already linked to an account"},
            )

        # Check wallet cap and set primary
        current = await self.list_wallets(user_id)
        if len(current) >= MAX_WALLETS_PER_INVESTOR:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "MAX_WALLETS_REACHED",
                    "message": f"Maximum {MAX_WALLETS_PER_INVESTOR} wallets per investor",
                },
            )
        is_primary = len(current) == 0

        # Trim + validate label, then enforce per-user case-insensitive uniqueness.
        if label is not None:
            label = label.strip()
            if not label:
                label = None
            elif len(label) > 50:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "LABEL_TOO_LONG",
                        "message": "Wallet label must be at most 50 characters.",
                    },
                )
        if label:
            label_taken = any(
                (w.label or "").strip().casefold() == label.casefold() for w in current
            )
            if label_taken:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "LABEL_TAKEN",
                        "message": "You already have a wallet with that name.",
                    },
                )

        # Screen wallet before linking
        from apps.api.services.wallet_screening_service import WalletScreeningService

        screening_svc = WalletScreeningService(self.db)
        screen_result = await screening_svc.screen_on_link(checksum)

        wallet = Wallet()
        wallet.user_id = user_id
        wallet.address = address  # will be encrypted by EncryptedString
        wallet.address_checksum = checksum
        wallet.is_primary = is_primary
        wallet.is_safe = is_safe
        wallet.label = label
        from datetime import UTC
        from datetime import datetime as dt_cls

        wallet.link_signature = signature
        wallet.link_nonce = nonce
        wallet.risk_score = screen_result["risk_score"]
        wallet.last_screened_at = dt_cls.now(UTC)

        self.db.add(wallet)

        # Audit trail — record link event
        from apps.api.models.wallet_audit import WalletAuditLog

        audit = WalletAuditLog()
        audit.user_id = user_id
        audit.action = "linked"
        audit.address = address
        audit.address_checksum = checksum
        audit.chain_id = wallet.chain_id
        audit.was_primary = is_primary
        audit.was_safe = is_safe
        audit.label = label
        audit.link_signature = signature
        audit.link_nonce = nonce
        audit.risk_score = screen_result["risk_score"]
        audit.linked_at = dt_cls.now(UTC)
        self.db.add(audit)

        await self.db.commit()
        await self.db.refresh(wallet)

        # Auto-register on-chain if user is KYC-approved with an ONCHAINID
        await self._auto_register_identity(user_id, wallet)

        return wallet

    async def _verify_safe_ownership(self, user_id: UUID, safe_address: str) -> None:
        """Verify the user owns an EOA that is an owner of the Safe at safe_address."""
        import asyncio

        from web3 import Web3

        checksum_safe = Web3.to_checksum_address(safe_address)

        # Get user's existing linked wallets (must have at least one EOA already)
        existing_wallets = await self.list_wallets(user_id)
        if not existing_wallets:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NO_EOA_LINKED",
                    "message": "You must link an EOA wallet before adding a Safe wallet",
                },
            )

        # Call getOwners() on the Safe contract
        safe_abi = [
            {
                "inputs": [],
                "name": "getOwners",
                "outputs": [{"type": "address[]"}],
                "stateMutability": "view",
                "type": "function",
            }
        ]

        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        safe_contract = w3.eth.contract(address=checksum_safe, abi=safe_abi)

        try:
            owners = await asyncio.to_thread(safe_contract.functions.getOwners().call)
        except Exception as e:
            logger.warning("Failed to call getOwners() on %s: %s", checksum_safe, e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "SAFE_CALL_FAILED",
                    "message": "Could not verify Safe owners. Is this a valid Safe address?",
                },
            )

        owners_lower = {o.lower() for o in owners}
        user_addresses = {w.address_checksum.lower() for w in existing_wallets}

        if not owners_lower & user_addresses:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NOT_SAFE_OWNER",
                    "message": "None of your linked wallets is an owner of this Safe",
                },
            )

        logger.info(
            "Safe ownership verified: user=%s safe=%s matching_owner(s)=%s",
            user_id, checksum_safe, owners_lower & user_addresses,
        )

    async def _auto_register_identity(self, user_id: UUID, wallet: Wallet) -> None:
        """If user is KYC-approved, register the new wallet on-chain.

        Enqueues a queued ``task_sync_wallet`` job (the safety net) and
        also fires the inline call as a fast-path so the user sees
        immediate registration. Both paths are idempotent — the worker
        re-checks ``wallet.registered_on_chain`` before doing anything.
        """
        try:
            result = await self.db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or user.kyc_status != "approved":
                return

            # Enqueue the safety-net job first so it exists even if the
            # inline call raises mid-execution.
            try:
                from apps.api.models.enums import IdentitySyncJobAction
                from apps.api.services.identity_sync_service import (
                    enqueue_identity_sync,
                )

                await enqueue_identity_sync(
                    self.db,
                    user_id=user.id,
                    action=IdentitySyncJobAction.ADD,
                    wallet_id=wallet.id,
                    wallet_address=wallet.address_checksum,
                )
            except Exception as exc:
                logger.warning(
                    "Failed to enqueue identity sync for wallet %s: %s",
                    wallet.address_checksum, exc,
                )

            # Inline fast-path — simple mode only (per phase-1 plan).
            if settings.identity_mode == "simple":
                from apps.api.services.simple_identity_bridge_service import (
                    SimpleIdentityBridgeService,
                )
                bridge = SimpleIdentityBridgeService(self.db)
                await bridge.register_wallet(user, wallet.address_checksum)
            else:
                # Full ERC-3643 mode — requires ONCHAINID to exist. Skip
                # the inline call and let the queued job handle it.
                if not user.onchain_id:
                    return
                from apps.api.services.identity_bridge_service import IdentityBridgeService
                bridge = IdentityBridgeService(self.db)
                await bridge.register_wallet(user, wallet.address_checksum)

            wallet.registered_on_chain = True
            await self.db.commit()
            logger.info(
                "Auto-registered wallet %s on-chain for user %s (mode=%s)",
                wallet.address_checksum, user_id, settings.identity_mode,
            )
        except Exception:
            logger.exception(
                "Failed inline auto-register for wallet %s on-chain (user %s) — "
                "queued job will retry",
                wallet.address_checksum, user_id,
            )

    async def _wallet_has_contributions(self, address_checksum: str) -> bool:
        """True if any Contribution row references this wallet address.

        Wallets that have ever participated in a sale are bound to that
        purchase history and cannot be deleted at all (verified or not).
        """
        from apps.api.models.contribution import Contribution

        contrib_q = await self.db.execute(
            select(Contribution.id)
            .where(Contribution.wallet_address == address_checksum.lower())
            .limit(1)
        )
        if contrib_q.scalar_one_or_none() is not None:
            return True
        # Older rows may have stored the checksum case
        contrib_q2 = await self.db.execute(
            select(Contribution.id)
            .where(Contribution.wallet_address == address_checksum)
            .limit(1)
        )
        return contrib_q2.scalar_one_or_none() is not None

    async def unlink_wallet(self, user_id: UUID, address: str) -> dict:
        """Delete or, for verified buyers, queue an admin-mediated deletion.

        Returns a dict so the endpoint can route to a 200 (deleted) or
        202 (deletion requested) response without re-querying.

        Restrictions enforced here:
          1. Wallet exists and belongs to the user, else 404.
          2. Cannot delete the primary wallet, else 400 PRIMARY_WALLET.
          3. Cannot delete a wallet that has any Contribution row,
             whether verified or not, else 409 WALLET_HAS_CONTRIBUTIONS.
          4. KYC-approved users get 202 + a WalletDeletionRequest row;
             admin must approve before the unlink + on-chain revoke fire.
          5. Unverified users with no contributions hit the existing
             direct-delete path (also enqueues a sync remove for safety,
             which no-ops because registered_on_chain is False).
        """
        from web3 import Web3

        checksum = Web3.to_checksum_address(address)
        result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.address_checksum == checksum)
        )
        wallet = result.scalar_one_or_none()
        if not wallet:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
        if wallet.is_primary:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "PRIMARY_WALLET",
                    "message": "Cannot remove primary wallet. Set another as primary first.",
                },
            )
        if await self._wallet_has_contributions(checksum):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "WALLET_HAS_CONTRIBUTIONS",
                    "message": "This wallet has bought tokens in a sale and cannot be removed.",
                },
            )

        # Verified users: queue an admin-mediated deletion request
        user_q = await self.db.execute(select(User).where(User.id == user_id))
        user = user_q.scalar_one_or_none()
        if user and user.kyc_status == "approved":
            return await self._queue_wallet_deletion_request(user_id, wallet)

        return await self._perform_unlink(user_id, wallet)

    async def _queue_wallet_deletion_request(
        self, user_id: UUID, wallet: Wallet, reason: str | None = None
    ) -> dict:
        """Insert a pending WalletDeletionRequest for an admin to review."""
        from apps.api.models.enums import WalletDeletionRequestStatus
        from apps.api.models.wallet_deletion_request import WalletDeletionRequest

        # Bail if there's already a pending request for this wallet — UI
        # should prevent this but defend in depth.
        existing_q = await self.db.execute(
            select(WalletDeletionRequest)
            .where(WalletDeletionRequest.wallet_id == wallet.id)
            .where(WalletDeletionRequest.status == WalletDeletionRequestStatus.PENDING)
        )
        if existing_q.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "DELETION_REQUEST_ALREADY_PENDING",
                    "message": "A removal request for this wallet is already pending admin review.",
                },
            )

        req = WalletDeletionRequest()
        req.user_id = user_id
        req.wallet_id = wallet.id
        req.wallet_address_snapshot = wallet.address_checksum
        req.reason = reason
        req.status = WalletDeletionRequestStatus.PENDING
        self.db.add(req)
        await self.db.commit()
        await self.db.refresh(req)
        logger.info(
            "Wallet deletion requested: user=%s wallet=%s request_id=%s",
            user_id, wallet.address_checksum, req.id,
        )
        return {
            "status": "deletion_requested",
            "request_id": str(req.id),
            "message": "Removal request submitted. An admin will review and approve.",
        }

    async def request_wallet_deletion(
        self, user_id: UUID, address: str, reason: str | None = None
    ) -> dict:
        """Explicit request-deletion endpoint for verified buyers.

        Same enforcement as unlink_wallet, but always routes to the
        deletion-request flow regardless of verification state. Used by
        the new POST /wallets/{address}/deletion-request endpoint.
        """
        from web3 import Web3

        checksum = Web3.to_checksum_address(address)
        result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.address_checksum == checksum)
        )
        wallet = result.scalar_one_or_none()
        if not wallet:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
        if wallet.is_primary:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "PRIMARY_WALLET",
                    "message": "Cannot remove primary wallet. Set another as primary first.",
                },
            )
        if await self._wallet_has_contributions(checksum):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "WALLET_HAS_CONTRIBUTIONS",
                    "message": "This wallet has bought tokens in a sale and cannot be removed.",
                },
            )
        return await self._queue_wallet_deletion_request(user_id, wallet, reason)

    async def _perform_unlink(self, user_id: UUID, wallet: Wallet) -> dict:
        """Actually delete the wallet row + audit trail + enqueue revoke.

        Used by the direct-delete path (unverified users) and by the
        admin approval flow.
        """
        from datetime import UTC
        from datetime import datetime as dt_cls

        from apps.api.models.enums import IdentitySyncJobAction
        from apps.api.models.wallet_audit import WalletAuditLog
        from apps.api.services.identity_sync_service import enqueue_identity_sync

        # Audit trail — record unlink event
        audit = WalletAuditLog()
        audit.user_id = user_id
        audit.action = "unlinked"
        audit.address = wallet.address_checksum  # plaintext to avoid double-encryption
        audit.address_checksum = wallet.address_checksum
        audit.chain_id = wallet.chain_id
        audit.was_primary = wallet.is_primary
        audit.was_safe = wallet.is_safe
        audit.was_registered_on_chain = wallet.registered_on_chain or False
        audit.label = wallet.label
        audit.link_signature = None
        audit.link_nonce = wallet.link_nonce
        audit.risk_score = wallet.risk_score
        audit.linked_at = wallet.linked_at
        audit.unlinked_at = dt_cls.now(UTC)
        self.db.add(audit)

        # Enqueue the on-chain revoke BEFORE deleting the wallet row.
        # Snapshot the address so the worker can still call
        # removeFromWhitelist even if the ``ON DELETE SET NULL`` FK
        # has wiped ``wallet_id`` by the time the task runs (happens
        # when the delete commits before the next sweep pass).
        try:
            await enqueue_identity_sync(
                self.db,
                user_id=user_id,
                action=IdentitySyncJobAction.REMOVE,
                wallet_id=wallet.id,
                wallet_address=wallet.address_checksum,
            )
        except Exception as exc:
            logger.warning(
                "Failed to enqueue identity sync remove for %s: %s",
                wallet.address_checksum, exc,
            )

        await self.db.delete(wallet)
        await self.db.commit()
        return {"status": "deleted"}

    async def rename_wallet(self, user_id: UUID, address: str, new_label: str) -> Wallet:
        """Rename an existing wallet's label, enforcing per-user uniqueness."""
        from web3 import Web3

        checksum = Web3.to_checksum_address(address)
        new_label = new_label.strip()
        if not new_label:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "LABEL_REQUIRED", "message": "Label cannot be blank."},
            )
        if len(new_label) > 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LABEL_TOO_LONG",
                    "message": "Wallet label must be at most 50 characters.",
                },
            )
        wallet_q = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.address_checksum == checksum)
        )
        wallet = wallet_q.scalar_one_or_none()
        if not wallet:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")

        siblings = await self.list_wallets(user_id)
        for s in siblings:
            if s.id == wallet.id:
                continue
            if (s.label or "").strip().casefold() == new_label.casefold():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "LABEL_TAKEN",
                        "message": "You already have a wallet with that name.",
                    },
                )

        wallet.label = new_label
        await self.db.commit()
        await self.db.refresh(wallet)
        return wallet

    async def set_primary(self, user_id: UUID, address: str) -> Wallet:
        from web3 import Web3

        checksum = Web3.to_checksum_address(address)
        # Unset all primaries for this user
        all_wallets = await self.list_wallets(user_id)
        target = None
        for w in all_wallets:
            if w.address_checksum == checksum:
                target = w
            w.is_primary = False
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
        target.is_primary = True
        await self.db.commit()
        await self.db.refresh(target)
        return target
