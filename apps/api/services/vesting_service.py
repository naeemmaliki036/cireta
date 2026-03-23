"""Vesting service for token vesting schedules."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.models.vesting_schedule import VestingSchedule


class VestingService:
    """Service for vesting operations."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize vesting service."""
        self.db = db

    async def create_schedule(
        self,
        token_id: UUID,
        user_id: UUID,
        total_amount: Decimal,
        cliff_end: datetime,
        vesting_end: datetime,
    ) -> VestingSchedule:
        """Create a new vesting schedule.

        Args:
            token_id: Token UUID.
            user_id: Beneficiary user UUID.
            total_amount: Total tokens to vest.
            cliff_end: When cliff period ends.
            vesting_end: When vesting fully completes.

        Returns:
            Created vesting schedule.
        """
        # Verify token exists
        token_result = await self.db.execute(select(Token).where(Token.id == token_id))
        if not token_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        # Verify user exists
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        schedule = VestingSchedule()
        schedule.token_id = token_id
        schedule.user_id = user_id
        schedule.total_amount = total_amount
        schedule.cliff_end = cliff_end
        schedule.vesting_end = vesting_end

        self.db.add(schedule)
        await self.db.commit()
        await self.db.refresh(schedule)

        return schedule

    async def get_user_schedules(self, user_id: UUID) -> list[VestingSchedule]:
        """Get all vesting schedules for a user.

        Args:
            user_id: User UUID.

        Returns:
            List of vesting schedules with token info.
        """
        result = await self.db.execute(
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.token))
            .where(VestingSchedule.user_id == user_id)
            .order_by(VestingSchedule.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_schedules(
        self, user_id: UUID, token_id: UUID | None = None
    ) -> list[VestingSchedule]:
        """Get vesting schedules for a user, optionally filtered by token.

        Args:
            user_id: User UUID.
            token_id: Optional token UUID filter.

        Returns:
            List of vesting schedules.
        """
        query = (
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.token))
            .where(VestingSchedule.user_id == user_id)
        )
        if token_id is not None:
            query = query.where(VestingSchedule.token_id == token_id)
        query = query.order_by(VestingSchedule.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_claimable(self, schedule_id: UUID) -> "Decimal":
        """Get claimable amount for a vesting schedule.

        Args:
            schedule_id: Schedule UUID.

        Returns:
            Claimable amount (0 if before cliff).
        """
        result = await self.db.execute(
            select(VestingSchedule).where(VestingSchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            return Decimal("0")
        return schedule.claimable_amount

    async def get_schedule(self, schedule_id: UUID, user_id: UUID) -> VestingSchedule:
        """Get a specific vesting schedule.

        Args:
            schedule_id: Schedule UUID.
            user_id: User UUID (for authorization).

        Returns:
            Vesting schedule.

        Raises:
            HTTPException: If not found or not authorized.
        """
        result = await self.db.execute(
            select(VestingSchedule)
            .options(selectinload(VestingSchedule.token))
            .where(VestingSchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()

        if not schedule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SCHEDULE_NOT_FOUND", "message": "Vesting schedule not found"},
            )

        if schedule.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"},
            )

        return schedule

    async def claim_tranche(
        self, schedule_id: UUID, user_id: UUID
    ) -> tuple[VestingSchedule, Decimal]:
        """Claim available vested tokens.

        Args:
            schedule_id: Schedule UUID.
            user_id: User UUID.

        Returns:
            Tuple of (updated schedule, claimed amount).

        Raises:
            HTTPException: If nothing to claim.
        """
        schedule = await self.get_schedule(schedule_id, user_id)

        claimable = schedule.claimable_amount
        if claimable <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NOTHING_TO_CLAIM", "message": "No tokens available to claim"},
            )

        # Update claimed amount
        schedule.claimed_amount = schedule.claimed_amount + claimable
        schedule.last_claim_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(schedule)

        return schedule, claimable
