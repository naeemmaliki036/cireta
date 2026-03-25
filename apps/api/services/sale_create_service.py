"""Sale write service — create, contribute, finalize, claim, refund."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import SaleStatus
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale


class SaleCreateService:
    """Create and setup token sales."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize sale service."""
        self.db = db

    async def create_sale(
        self,
        user_id: UUID,
        token_id: UUID,
        payment_token: str,
        soft_cap: Decimal,
        hard_cap: Decimal,
        phases: list[dict],
    ) -> TokenSale:
        """Create a new token sale.

        Args:
            user_id: User UUID (must be token issuer).
            token_id: Token UUID.
            payment_token: Payment token address (USDC).
            soft_cap: Minimum funding goal.
            hard_cap: Maximum funding cap.
            phases: List of phase configurations.

        Returns:
            Created token sale.

        Raises:
            HTTPException: If not authorized or invalid configuration.
        """
        # Get token with issuer
        result = await self.db.execute(
            select(Token).options(selectinload(Token.issuer)).where(Token.id == token_id)
        )
        token = result.scalar_one_or_none()

        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        # Check authorization — issuer must own this token
        if not token.issuer or token.issuer.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized to manage this token"},
            )

        # Token must be deployed on-chain before a sale can be created
        if not token.contract_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "TOKEN_NOT_DEPLOYED", "message": "Token must be deployed on-chain before creating a sale"},
            )

        if hard_cap < soft_cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_CAPS", "message": "Hard cap must be >= soft cap"},
            )

        # Create sale
        sale = TokenSale()
        sale.token_id = token_id
        sale.issuer_id = token.issuer_id
        sale.payment_token = payment_token
        sale.soft_cap = soft_cap
        sale.hard_cap = hard_cap
        sale.status = SaleStatus.DRAFT

        self.db.add(sale)
        await self.db.flush()

        # Create phases
        for i, phase_data in enumerate(phases, start=1):
            phase = SalePhase()
            phase.sale_id = sale.id
            phase.phase_number = i
            phase.name = phase_data["name"]
            phase.price_per_token = phase_data["price_per_token"]
            phase.allocation = phase_data["allocation"]
            phase.min_contribution = phase_data.get("min_contribution", Decimal("0"))
            phase.max_contribution = phase_data.get("max_contribution", Decimal("0"))
            phase.start_time = phase_data["start_time"]
            phase.end_time = phase_data["end_time"]
            phase.whitelist_only = phase_data.get("whitelist_only", False)

            self.db.add(phase)

        await self.db.commit()

        # Re-fetch with all relations needed by the endpoint response
        result2 = await self.db.execute(
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
            .where(TokenSale.id == sale.id)
        )
        return result2.scalar_one()
