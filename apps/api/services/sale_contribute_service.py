"""Sale contribute service — contribute, finalize, claim, refund."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, SaleStatus
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User


class SaleContributeService:
    """Contribution lifecycle: contribute, finalize, claim, refund."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db

    async def contribute(
        self,
        user_id: UUID,
        sale_id: UUID,
        amount: Decimal,
        tx_hash: str,
    ) -> Contribution:
        """Record a contribution to a token sale.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.
            amount: Contribution amount in payment token.
            tx_hash: Blockchain transaction hash.

        Returns:
            Created contribution.

        Raises:
            HTTPException: If not eligible or sale not active.
        """
        # Get user and check KYC
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        if not user.can_invest:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "KYC_REQUIRED",
                    "message": "KYC level 2 required to invest",
                },
            )

        # Get sale with phases
        sale_result = await self.db.execute(
            select(TokenSale)
            .options(selectinload(TokenSale.phases))
            .where(TokenSale.id == sale_id)
        )
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if not sale.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SALE_NOT_ACTIVE", "message": "Sale is not active"},
            )

        # Find current active phase
        active_phase = None
        for phase in sale.phases:
            if phase.is_active:
                active_phase = phase
                break

        if not active_phase:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NO_ACTIVE_PHASE", "message": "No active sale phase"},
            )

        # Check contribution limits
        if active_phase.min_contribution > 0 and amount < active_phase.min_contribution:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "BELOW_MINIMUM",
                    "message": f"Minimum contribution is {active_phase.min_contribution}",
                },
            )

        if active_phase.max_contribution > 0 and amount > active_phase.max_contribution:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ABOVE_MAXIMUM",
                    "message": f"Maximum contribution is {active_phase.max_contribution}",
                },
            )

        # Check tx_hash uniqueness
        existing = await self.db.execute(
            select(Contribution).where(Contribution.tx_hash == tx_hash)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "TX_EXISTS", "message": "Transaction already recorded"},
            )

        # Calculate tokens allocated
        tokens_allocated = amount / active_phase.price_per_token

        # Create contribution
        contribution = Contribution()
        contribution.user_id = user_id
        contribution.sale_id = sale_id
        contribution.phase_id = active_phase.id
        contribution.amount = amount
        contribution.tokens_allocated = tokens_allocated
        contribution.tx_hash = tx_hash
        contribution.status = ContributionStatus.PENDING

        self.db.add(contribution)

        # Update sale total raised
        sale.total_raised = sale.total_raised + amount

        await self.db.commit()
        await self.db.refresh(contribution)

        return contribution

    async def finalize_sale(self, user_id: UUID, sale_id: UUID) -> TokenSale:
        """Finalize a token sale.

        Args:
            user_id: User UUID (must be issuer).
            sale_id: Sale UUID.

        Returns:
            Updated sale.

        Raises:
            HTTPException: If not authorized or cannot finalize.
        """
        sale_result = await self.db.execute(
            select(TokenSale)
            .options(selectinload(TokenSale.issuer))
            .where(TokenSale.id == sale_id)
        )
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if sale.issuer.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"},
            )

        if sale.status != SaleStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NOT_ACTIVE", "message": "Sale is not active"},
            )

        # Determine final status
        if sale.soft_cap_reached:
            sale.status = SaleStatus.FINALIZED

            # Confirm all pending contributions
            await self.db.execute(
                Contribution.__table__.update()
                .where(Contribution.sale_id == sale_id)
                .where(Contribution.status == ContributionStatus.PENDING)
                .values(status=ContributionStatus.CONFIRMED)
            )
        else:
            sale.status = SaleStatus.FAILED

        await self.db.commit()
        await self.db.refresh(sale)

        return sale

    async def claim_tokens(self, user_id: UUID, sale_id: UUID) -> list[Contribution]:
        """Claim tokens from a finalized sale.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.

        Returns:
            List of claimed contributions.

        Raises:
            HTTPException: If nothing to claim.
        """
        # Get user's confirmed contributions
        result = await self.db.execute(
            select(Contribution)
            .where(Contribution.user_id == user_id)
            .where(Contribution.sale_id == sale_id)
            .where(Contribution.status == ContributionStatus.CONFIRMED)
        )
        contributions = list(result.scalars().all())

        if not contributions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOTHING_TO_CLAIM", "message": "No claimable contributions"},
            )

        # Mark as claimed
        now = datetime.now(UTC)
        for contrib in contributions:
            contrib.status = ContributionStatus.CLAIMED
            contrib.claimed_at = now

        await self.db.commit()

        return contributions

    async def claim_refund(self, user_id: UUID, sale_id: UUID) -> list[Contribution]:
        """Claim refund from a failed sale.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.

        Returns:
            List of refunded contributions.

        Raises:
            HTTPException: If nothing to refund.
        """
        # Get sale
        sale_result = await self.db.execute(
            select(TokenSale).where(TokenSale.id == sale_id)
        )
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if sale.status != SaleStatus.FAILED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SALE_NOT_FAILED", "message": "Sale is not failed"},
            )

        # Get user's pending contributions
        result = await self.db.execute(
            select(Contribution)
            .where(Contribution.user_id == user_id)
            .where(Contribution.sale_id == sale_id)
            .where(Contribution.status == ContributionStatus.PENDING)
        )
        contributions = list(result.scalars().all())

        if not contributions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOTHING_TO_REFUND", "message": "No refundable contributions"},
            )

        # Mark as refunded
        for contrib in contributions:
            contrib.status = ContributionStatus.REFUNDED

        await self.db.commit()

        return contributions
