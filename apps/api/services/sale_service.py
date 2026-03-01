"""Sale service for token sale operations."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, SaleStatus
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User


class SaleService:
    """Service for token sale operations."""

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
            select(Token)
            .options(selectinload(Token.issuer))
            .where(Token.id == token_id)
        )
        token = result.scalar_one_or_none()

        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        # Check authorization
        if token.issuer.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"},
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
        await self.db.refresh(sale)

        return sale

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


    async def get_sale_by_token_slug(self, slug: str) -> TokenSale | None:
        """Get a sale by the token's slug."""
        from apps.api.models.token import Token
        query = (
            select(TokenSale)
            .join(Token, TokenSale.token_id == Token.id)
            .where(Token.slug == slug)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_sales(
        self, page: int = 1, size: int = 20, status_filter: SaleStatus | None = None
    ) -> tuple[list[TokenSale], int]:
        """List sales with pagination.

        Args:
            page: Page number (1-indexed).
            size: Page size.
            status_filter: Optional status filter.

        Returns:
            Tuple of (sales, total_count).
        """
        query = (
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
            .order_by(TokenSale.created_at.desc())
        )

        if status_filter:
            query = query.where(TokenSale.status == status_filter)

        # Count total
        count_query = select(func.count()).select_from(TokenSale)
        if status_filter:
            count_query = count_query.where(TokenSale.status == status_filter)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        sales = list(result.scalars().all())

        return sales, total

    async def get_sale(self, sale_id: UUID) -> TokenSale:
        """Get a sale by ID.

        Args:
            sale_id: Sale UUID.

        Returns:
            TokenSale with phases.

        Raises:
            HTTPException: If not found.
        """
        result = await self.db.execute(
            select(TokenSale)
            .options(selectinload(TokenSale.phases))
            .where(TokenSale.id == sale_id)
        )
        sale = result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        return sale
