"""Unit tests for VestingService."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.models.vesting_schedule import VestingSchedule
from apps.api.services.vesting_service import VestingService


class TestVestingServiceCreate:
    """Tests for vesting schedule creation."""

    async def test_create_schedule_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test successful vesting schedule creation."""
        service = VestingService(db_session)
        now = datetime.now(UTC)

        schedule = await service.create_schedule(
            token_id=test_token.id,
            user_id=test_user.id,
            total_amount=Decimal("10000"),
            cliff_end=now + timedelta(days=90),
            vesting_end=now + timedelta(days=365),
        )

        assert schedule.id is not None
        assert schedule.token_id == test_token.id
        assert schedule.user_id == test_user.id
        assert schedule.total_amount == Decimal("10000")
        assert schedule.claimed_amount == Decimal("0")


class TestVestingServiceGet:
    """Tests for getting vesting schedules."""

    async def test_get_schedules_empty(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test getting schedules when none exist."""
        service = VestingService(db_session)

        schedules = await service.get_schedules(test_user.id)

        assert isinstance(schedules, list)

    async def test_get_schedules_for_token(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test getting schedules filtered by token."""
        service = VestingService(db_session)

        # Create a schedule first
        now = datetime.now(UTC)
        await service.create_schedule(
            token_id=test_token.id,
            user_id=test_user.id,
            total_amount=Decimal("5000"),
            cliff_end=now + timedelta(days=30),
            vesting_end=now + timedelta(days=180),
        )

        schedules = await service.get_schedules(
            user_id=test_user.id, token_id=test_token.id
        )

        assert len(schedules) >= 1
        assert all(s.token_id == test_token.id for s in schedules)


class TestVestingServiceClaimable:
    """Tests for claimable amount calculation."""

    async def test_get_claimable_before_cliff(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test claimable is zero before cliff."""
        service = VestingService(db_session)
        now = datetime.now(UTC)

        schedule = await service.create_schedule(
            token_id=test_token.id,
            user_id=test_user.id,
            total_amount=Decimal("10000"),
            cliff_end=now + timedelta(days=90),  # Cliff in future
            vesting_end=now + timedelta(days=365),
        )

        claimable = await service.get_claimable(schedule.id)

        assert claimable == Decimal("0")


class TestVestingServiceClaim:
    """Tests for claiming vested tokens."""

    async def test_claim_nothing_vested(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test claiming when nothing is vested fails."""
        service = VestingService(db_session)
        now = datetime.now(UTC)

        schedule = await service.create_schedule(
            token_id=test_token.id,
            user_id=test_user.id,
            total_amount=Decimal("10000"),
            cliff_end=now + timedelta(days=90),
            vesting_end=now + timedelta(days=365),
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.claim_tranche(test_user.id, schedule.id)

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "NOTHING_TO_CLAIM"

    async def test_claim_schedule_not_found(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test claiming non-existent schedule fails."""
        service = VestingService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.claim_tranche(test_user.id, uuid4())

        assert exc_info.value.status_code == 404
