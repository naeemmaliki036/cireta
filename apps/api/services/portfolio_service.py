"""Portfolio service for user holdings overview."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, RedemptionStatus
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.vesting_schedule import VestingSchedule


class PortfolioService:
    """Service for portfolio operations."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize portfolio service."""
        self.db = db

    async def get_holdings(self, user_id: UUID) -> list[dict]:
        """Get user's token holdings summary.

        Aggregates holdings from:
        - Claimed contributions
        - Vesting schedules (claimed amount)

        Args:
            user_id: User UUID.

        Returns:
            List of holdings with token info.
        """
        holdings: dict[str, dict] = {}

        # Get claimed contributions
        contrib_result = await self.db.execute(
            select(Contribution)
            .options(
                selectinload(Contribution.sale).selectinload(Contribution.sale.token)
            )
            .where(Contribution.user_id == user_id)
            .where(Contribution.status == ContributionStatus.CLAIMED)
        )
        contributions = contrib_result.scalars().all()

        for contrib in contributions:
            token = contrib.sale.token
            token_id = str(token.id)

            if token_id not in holdings:
                holdings[token_id] = {
                    "token_id": token_id,
                    "token_symbol": token.symbol,
                    "token_name": token.name,
                    "balance": Decimal("0"),
                    "vested_amount": Decimal("0"),
                    "claimable_amount": Decimal("0"),
                }

            holdings[token_id]["balance"] += contrib.tokens_allocated

        # Get vesting schedules
        vesting_result = await self.db.execute(
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.token))
            .where(VestingSchedule.user_id == user_id)
        )
        schedules = vesting_result.scalars().all()

        for schedule in schedules:
            token_id = str(schedule.token_id)

            if token_id not in holdings:
                holdings[token_id] = {
                    "token_id": token_id,
                    "token_symbol": schedule.token.symbol,
                    "token_name": schedule.token.name,
                    "balance": Decimal("0"),
                    "vested_amount": Decimal("0"),
                    "claimable_amount": Decimal("0"),
                }

            holdings[token_id]["vested_amount"] += schedule.claimed_amount
            holdings[token_id]["claimable_amount"] += schedule.claimable_amount

        return list(holdings.values())

    async def get_portfolio_summary(self, user_id: UUID) -> dict:
        """Get comprehensive portfolio summary.

        Args:
            user_id: User UUID.

        Returns:
            Portfolio summary with holdings, vesting, and redemptions.
        """
        holdings = await self.get_holdings(user_id)

        # Count vesting schedules
        vesting_count_result = await self.db.execute(
            select(VestingSchedule).where(VestingSchedule.user_id == user_id)
        )
        vesting_count = len(vesting_count_result.scalars().all())

        # Count pending redemptions
        redemption_count_result = await self.db.execute(
            select(RedemptionRequest)
            .where(RedemptionRequest.user_id == user_id)
            .where(RedemptionRequest.status == RedemptionStatus.PENDING)
        )
        pending_redemptions = len(redemption_count_result.scalars().all())

        return {
            "total_holdings": len(holdings),
            "total_vesting_schedules": vesting_count,
            "total_pending_redemptions": pending_redemptions,
            "holdings": holdings,
        }
