"""Portfolio service for user holdings overview."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, RedemptionStatus
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.token_sale import TokenSale
from apps.api.models.vesting_schedule import VestingSchedule


def _compute_vesting_progress(
    cliff_end: datetime | None,
    vesting_end: datetime | None,
) -> tuple[float, datetime | None]:
    """Return (progress 0..1, next_unlock_at) for a vesting schedule.

    Cliff-only schedules collapse to a step function (0% before cliff, 100% after).
    Linear schedules interpolate between cliff_end and vesting_end.
    """
    if cliff_end is None:
        return (0.0, None)
    now = datetime.now(UTC)
    cliff = cliff_end if cliff_end.tzinfo else cliff_end.replace(tzinfo=UTC)
    end = vesting_end if vesting_end and vesting_end.tzinfo else (
        vesting_end.replace(tzinfo=UTC) if vesting_end else None
    )
    if now < cliff:
        return (0.0, cliff)
    if end is None or end <= cliff:
        # cliff-only schedule — fully unlocked at cliff
        return (1.0, cliff)
    if now >= end:
        return (1.0, end)
    span = (end - cliff).total_seconds()
    elapsed = (now - cliff).total_seconds()
    return (max(0.0, min(1.0, elapsed / span)), end)


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

        # Pull both CLAIMED and CONFIRMED contributions. CLAIMED → buyer
        # already redeemed and holds transferable ERC-3643 project tokens.
        # CONFIRMED → buyer holds soul-bound fraction tokens (locked, awaiting
        # vesting + claim). Both should appear in the portfolio so the buyer
        # sees the value of every position.
        contrib_result = await self.db.execute(
            select(Contribution)
            .options(selectinload(Contribution.sale).selectinload(TokenSale.token))
            .where(Contribution.user_id == user_id)
            .where(
                Contribution.status.in_(
                    [ContributionStatus.CLAIMED, ContributionStatus.CONFIRMED]
                )
            )
        )
        contributions = contrib_result.scalars().all()

        for contrib in contributions:
            token = contrib.sale.token
            token_id = str(token.id)
            is_locked = contrib.status == ContributionStatus.CONFIRMED
            # Bucket each token by lock status so a buyer with both
            # transferable + locked balances sees them as two rows.
            bucket_key = f"{token_id}:{'locked' if is_locked else 'unlocked'}"

            if bucket_key not in holdings:
                holdings[bucket_key] = {
                    "token_id": token_id,
                    "token_symbol": token.symbol,
                    "token_name": token.name,
                    "asset_type": token.asset_type if hasattr(token, "asset_type") else "commodity",
                    "balance": Decimal("0"),
                    "invested_usd": Decimal("0"),
                    "vested_amount": Decimal("0"),
                    "claimable_amount": Decimal("0"),
                    "locked": is_locked,
                    "is_redeemable": getattr(contrib.sale, "is_redeemable", False) or False,
                    "sale_mode": getattr(contrib.sale, "sale_mode", "direct") or "direct",
                    "contract_address": getattr(token, "contract_address", None),
                    "vesting_progress": 0.0,
                    "cliff_end": None,
                    "vesting_end": None,
                    "next_unlock_at": None,
                }

            # Promote is_redeemable if any contributing sale has it enabled
            if getattr(contrib.sale, "is_redeemable", False):
                holdings[bucket_key]["is_redeemable"] = True

            holdings[bucket_key]["balance"] += contrib.tokens_allocated
            holdings[bucket_key]["invested_usd"] += contrib.amount

        # Get vesting schedules
        vesting_result = await self.db.execute(
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.token))
            .where(VestingSchedule.user_id == user_id)
        )
        schedules = vesting_result.scalars().all()

        for schedule in schedules:
            token_id = str(schedule.token_id)
            # Vesting timeline belongs on whichever bucket the buyer actually
            # has a position in. Prefer the locked bucket (still-vesting fraction
            # holdings) over the unlocked one (post-claim project tokens).
            # Fallback: create a stand-alone unlocked bucket only if neither
            # exists — that's the rare case where a vesting schedule outlives
            # both contributions.
            locked_key = f"{token_id}:locked"
            unlocked_key = f"{token_id}:unlocked"
            if locked_key in holdings:
                bucket_key = locked_key
            elif unlocked_key in holdings:
                bucket_key = unlocked_key
            else:
                bucket_key = unlocked_key
                holdings[bucket_key] = {
                    "token_id": token_id,
                    "token_symbol": schedule.token.symbol,
                    "token_name": schedule.token.name,
                    "balance": Decimal("0"),
                    "invested_usd": Decimal("0"),
                    "vested_amount": Decimal("0"),
                    "claimable_amount": Decimal("0"),
                    "locked": False,
                    "sale_mode": "vested",
                    "contract_address": getattr(schedule.token, "contract_address", None),
                    "vesting_progress": 0.0,
                    "cliff_end": None,
                    "vesting_end": None,
                    "next_unlock_at": None,
                }

            holdings[bucket_key]["vested_amount"] += schedule.claimed_amount
            holdings[bucket_key]["claimable_amount"] += schedule.claimable_amount

            # Populate vesting timeline from the schedule. When a holding has
            # multiple schedules (rare), use the latest unlock as the canonical
            # one — investors care about when the *last* slice opens.
            progress, next_unlock = _compute_vesting_progress(
                schedule.cliff_end, schedule.vesting_end
            )
            existing_next = holdings[bucket_key]["next_unlock_at"]
            if existing_next is None or (next_unlock and next_unlock > existing_next):
                holdings[bucket_key]["cliff_end"] = schedule.cliff_end
                holdings[bucket_key]["vesting_end"] = schedule.vesting_end
                holdings[bucket_key]["next_unlock_at"] = next_unlock
                holdings[bucket_key]["vesting_progress"] = progress

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

        # Calculate totals from holdings
        from decimal import Decimal as _D

        total_invested = _D("0")
        for h in holdings:
            if isinstance(h, dict) and "invested_usd" in h:
                total_invested += h["invested_usd"]
        # total_value_usd = total_invested until real-time pricing is integrated
        total_value = total_invested

        # Count claimable vesting
        from apps.api.models.vesting_schedule import VestingSchedule as _VS  # noqa: F811

        vesting_result = await self.db.execute(select(_VS).where(_VS.user_id == user_id))
        vesting_schedules = vesting_result.scalars().all()
        pending_claims = sum(1 for s in vesting_schedules if s.claimable_amount > _D("0"))

        return {
            "total_holdings": len(holdings),
            "total_vesting_schedules": vesting_count,
            "total_pending_redemptions": pending_redemptions,
            "total_value_usd": total_value,
            "total_invested_usd": total_invested,
            "holdings_count": len(holdings),
            "pending_claims": pending_claims,
            "pending_redemptions": pending_redemptions,
            "holdings": holdings,
        }
