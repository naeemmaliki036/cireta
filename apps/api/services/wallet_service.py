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
        message = encode_defunct(text=f"Link wallet to Cireta account: {nonce}")
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
        # Verify ownership signature
        if not verify_wallet_signature(address, signature, nonce):
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

        wallet.risk_score = screen_result["risk_score"]
        wallet.last_screened_at = dt_cls.now(UTC)

        self.db.add(wallet)
        await self.db.commit()
        await self.db.refresh(wallet)

        # Auto-register on-chain if user is KYC-approved with an ONCHAINID
        await self._auto_register_identity(user_id, wallet)

        return wallet

    async def _auto_register_identity(self, user_id: UUID, wallet: Wallet) -> None:
        """If user is KYC-approved, register new wallet on-chain.

        Uses SimpleIdentityBridgeService or IdentityBridgeService based on
        IDENTITY_MODE config setting.
        """
        try:
            result = await self.db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or user.kyc_status != "approved":
                return

            if settings.identity_mode == "simple":
                from apps.api.services.simple_identity_bridge_service import (
                    SimpleIdentityBridgeService,
                )
                bridge = SimpleIdentityBridgeService(self.db)
                await bridge.register_wallet(user, wallet.address_checksum)
            else:
                # Full ERC-3643 mode — requires ONCHAINID to exist
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
                "Failed to auto-register wallet %s on-chain for user %s",
                wallet.address_checksum, user_id,
            )

    async def unlink_wallet(self, user_id: UUID, address: str) -> None:
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
        await self.db.delete(wallet)
        await self.db.commit()

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
