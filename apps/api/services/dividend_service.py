"""Dividend distribution service — deposit, query claimable, record claims."""

import logging
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.dividend_distribution import DividendDistribution
from apps.api.models.issuer import Issuer
from apps.api.models.token import Token
from apps.api.models.wallet import Wallet

logger = logging.getLogger(__name__)

USDC_DECIMALS = 6


class DividendService:
    """Dividend lifecycle: deposit, query claimable, claim."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def deposit_dividend(
        self, user_id: UUID, token_id: UUID, amount_usdc: Decimal, tx_hash: str | None = None
    ) -> DividendDistribution:
        """Record a dividend deposit by an issuer.

        The issuer has already called DividendDistributor.deposit() on-chain.
        This records the epoch in the DB for tracking.
        """
        # Verify issuer owns this token
        issuer_result = await self.db.execute(select(Issuer).where(Issuer.user_id == user_id))
        issuer = issuer_result.scalar_one_or_none()
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_ISSUER", "message": "Issuer access required"},
            )

        token_result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = token_result.scalar_one_or_none()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )
        if token.issuer_id != issuer.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Token does not belong to this issuer"},
            )

        # Read on-chain epoch count if contract deployed
        epoch_index = 0
        total_supply_snapshot = Decimal("0")
        contract_address = self._get_distributor_address(token)

        if contract_address:
            try:
                epoch_index, total_supply_snapshot = await self._read_latest_epoch(
                    contract_address
                )
            except Exception:
                logger.warning("Failed to read on-chain epoch for token=%s", token_id, exc_info=True)

        dist = DividendDistribution()
        dist.token_id = token_id
        dist.epoch_index = epoch_index
        dist.total_amount = amount_usdc
        dist.total_supply_snapshot = total_supply_snapshot
        dist.contract_address = contract_address
        dist.tx_hash = tx_hash
        self.db.add(dist)
        await self.db.commit()
        await self.db.refresh(dist)

        logger.info("Dividend deposit recorded: token=%s epoch=%d amount=%s", token_id, epoch_index, amount_usdc)
        return dist

    async def get_claimable_dividends(self, user_id: UUID) -> list[dict]:
        """Get claimable dividend info for all tokens the user holds.

        Reads on-chain claimable amounts from DividendDistributor contracts.
        """
        # Get user's primary wallet
        wallet_result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.is_primary.is_(True))
        )
        wallet = wallet_result.scalar_one_or_none()
        if not wallet:
            return []

        # Get tokens with dividend distributions
        dist_result = await self.db.execute(
            select(DividendDistribution)
            .options(selectinload(DividendDistribution.token))
            .order_by(DividendDistribution.created_at.desc())
        )
        distributions = dist_result.scalars().all()

        # Group by token
        seen_tokens: dict[str, dict] = {}
        for dist in distributions:
            token_id = str(dist.token_id)
            if token_id in seen_tokens:
                seen_tokens[token_id]["total_earned"] += dist.total_amount
                continue

            claimable = Decimal("0")
            contract_address = dist.contract_address
            if contract_address:
                try:
                    claimable = await self._read_claimable(contract_address, wallet.address)
                except Exception:
                    logger.debug("Failed to read claimable for token=%s", token_id, exc_info=True)

            token = dist.token if hasattr(dist, "token") and dist.token else None
            seen_tokens[token_id] = {
                "token_id": token_id,
                "token_symbol": token.symbol if token else "???",
                "token_name": token.name if token else "Unknown",
                "claimable_usdc": str(claimable),
                "total_earned": dist.total_amount,
                "contract_address": contract_address,
            }

        # Convert total_earned to string
        result = []
        for entry in seen_tokens.values():
            entry["total_earned"] = str(entry["total_earned"])
            result.append(entry)

        return result

    def _get_distributor_address(self, token: Token) -> str | None:
        """Get the DividendDistributor contract address for a token.

        Reads from the token model's dividend_distributor_address field,
        which is set when the issuer deploys the DividendDistributor contract.
        """
        return getattr(token, "dividend_distributor_address", None) or None

    async def _read_latest_epoch(self, contract_address: str) -> tuple[int, Decimal]:
        """Read the latest epoch count and supply snapshot from on-chain."""
        from apps.api.services.web3_base_service import Web3BaseService

        abi = [
            {
                "inputs": [],
                "name": "epochCount",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
        ]
        svc = Web3BaseService()
        epoch_count = await svc.call_contract(contract_address, abi, "epochCount")
        if epoch_count == 0:
            return (0, Decimal("0"))
        return (epoch_count - 1, Decimal("0"))

    async def _read_claimable(self, contract_address: str, wallet_address: str) -> Decimal:
        """Read on-chain claimable USDC for a holder."""
        from web3 import Web3

        from apps.api.services.web3_base_service import Web3BaseService

        abi = [
            {
                "inputs": [{"name": "holder", "type": "address"}],
                "name": "claimable",
                "outputs": [{"name": "total", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
        ]
        svc = Web3BaseService()
        raw = await svc.call_contract(
            contract_address, abi, "claimable", Web3.to_checksum_address(wallet_address)
        )
        return Decimal(str(raw)) / Decimal(10**USDC_DECIMALS)
