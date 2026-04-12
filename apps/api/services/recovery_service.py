"""Recovery service — business logic for token recovery operations.

Coordinates on-chain recovery calls (ERC-3643 + ERC-1155) with DB audit
logging. Supports cross-user force-transfers.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import RecoveryTokenType
from apps.api.models.recovery_log import RecoveryLog
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from apps.api.services.web3_recovery_service import Web3RecoveryService

logger = logging.getLogger(__name__)


def _find_user_by_wallet(
    wallets_rows: list[tuple], address: str
) -> tuple[UUID | None, str | None]:
    """Match a wallet address to its user from a pre-fetched list."""
    addr_lower = address.lower()
    for wallet, user in wallets_rows:
        if wallet.address.lower() == addr_lower:
            return user.id, user.email
    return None, None


class RecoveryService:
    """Thin service over Web3RecoveryService + recovery_logs."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.web3 = Web3RecoveryService()

    async def recover_fractions(
        self,
        *,
        sale_id: UUID,
        from_address: str,
        to_address: str,
        fraction_id: int,
        amount: int,
        reason: str,
        admin_id: UUID,  # noqa: ARG002
    ) -> RecoveryLog:
        """Force-transfer ERC-1155 fractions and log the action."""
        # Resolve sale → fraction token address
        sale = (
            await self.db.execute(select(TokenSale).where(TokenSale.id == sale_id))
        ).scalar_one_or_none()
        if not sale:
            raise ValueError(f"Sale {sale_id} not found")
        if not sale.fraction_token_address:
            raise ValueError(f"Sale {sale_id} has no fraction token")

        # Resolve users from wallet addresses
        from_user_id, from_email = await self._resolve_wallet_user(from_address)
        to_user_id, to_email = await self._resolve_wallet_user(to_address)

        # On-chain call
        receipt = await self.web3.recover_fractions(
            fraction_token_address=sale.fraction_token_address,
            from_addr=from_address,
            to_addr=to_address,
            fraction_id=fraction_id,
            amount=amount,
            reason=reason,
        )
        tx_hash = receipt.transactionHash.hex()

        # Audit log
        log = RecoveryLog(
            token_id=sale.token_id,
            issuer_id=sale.issuer_id,
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            lost_wallet=from_address,
            new_wallet=to_address,
            reason=reason,
            tx_hash=tx_hash,
            token_type=RecoveryTokenType.FRACTION_1155.value,
            fraction_id=fraction_id,
            amount=Decimal(str(amount)),
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)

        logger.info(
            "Fraction recovery: %s → %s, id=%d, amount=%d, tx=%s",
            from_address, to_address, fraction_id, amount, tx_hash,
        )
        return log

    async def force_transfer_erc3643(
        self,
        *,
        token_id: UUID,
        from_address: str,
        to_address: str,
        amount: int,
        reason: str,
        admin_id: UUID,  # noqa: ARG002
    ) -> RecoveryLog:
        """Cross-user force-transfer ERC-3643 tokens and log."""
        token = (
            await self.db.execute(select(Token).where(Token.id == token_id))
        ).scalar_one_or_none()
        if not token:
            raise ValueError(f"Token {token_id} not found")
        if not token.contract_address:
            raise ValueError(f"Token {token_id} has no contract address")

        from_user_id, from_email = await self._resolve_wallet_user(from_address)
        to_user_id, to_email = await self._resolve_wallet_user(to_address)

        receipt = await self.web3.force_transfer_erc3643(
            token_address=token.contract_address,
            from_addr=from_address,
            to_addr=to_address,
            amount=amount,
            reason=reason,
        )
        tx_hash = receipt.transactionHash.hex()

        log = RecoveryLog(
            token_id=token_id,
            issuer_id=token.issuer_id,
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            lost_wallet=from_address,
            new_wallet=to_address,
            reason=reason,
            tx_hash=tx_hash,
            token_type=RecoveryTokenType.ERC3643.value,
            amount=Decimal(str(amount)),
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)

        logger.info(
            "ERC-3643 force transfer: %s → %s, amount=%d, tx=%s",
            from_address, to_address, amount, tx_hash,
        )
        return log

    async def _resolve_wallet_user(
        self, address: str
    ) -> tuple[UUID | None, str | None]:
        """Look up the user who owns a given wallet address."""
        result = await self.db.execute(
            select(Wallet, User)
            .join(User, Wallet.user_id == User.id)
            .where(Wallet.address == address.lower())
        )
        row = result.first()
        if row:
            wallet, user = row
            return user.id, user.email
        return None, None
