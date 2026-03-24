"""Wallet management service."""

from __future__ import annotations

import logging
from uuid import UUID

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.wallet import Wallet

logger = logging.getLogger(__name__)


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

        # Check if this user has no wallets yet (make primary)
        current = await self.list_wallets(user_id)
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
        return wallet

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
