"""Unit tests for RedemptionService."""

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.services.redemption_service import RedemptionService


class TestRedemptionServiceCreate:
    """Tests for redemption request creation."""

    async def test_create_request_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test successful redemption request creation."""
        service = RedemptionService(db_session)

        request = await service.create_request(
            user_id=test_user.id,
            token_id=test_token.id,
            amount=Decimal("1000"),
            fulfillment_method="cash",
        )

        assert request.id is not None
        assert request.user_id == test_user.id
        assert request.token_id == test_token.id
        assert request.amount == Decimal("1000")
        assert request.status.value == "pending"

    async def test_create_request_token_not_found(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test request creation fails for non-existent token."""
        service = RedemptionService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_request(
                user_id=test_user.id,
                token_id=uuid4(),
                amount=Decimal("1000"),
                fulfillment_method="cash",
            )

        assert exc_info.value.status_code == 404

    async def test_create_request_physical_fulfillment(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test physical fulfillment request."""
        service = RedemptionService(db_session)

        request = await service.create_request(
            user_id=test_user.id,
            token_id=test_token.id,
            amount=Decimal("5000"),
            fulfillment_method="physical",
        )

        assert request.fulfillment_method.value == "physical"


class TestRedemptionServiceList:
    """Tests for listing redemption requests."""

    async def test_list_requests_empty(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test listing requests when none exist."""
        service = RedemptionService(db_session)

        requests = await service.list_requests(test_user.id)

        assert isinstance(requests, list)

    async def test_list_requests_for_token(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test listing requests filtered by token."""
        service = RedemptionService(db_session)

        # Create a request first
        await service.create_request(
            user_id=test_user.id,
            token_id=test_token.id,
            amount=Decimal("500"),
            fulfillment_method="cash",
        )

        requests = await service.list_requests(
            user_id=test_user.id, token_id=test_token.id
        )

        assert len(requests) >= 1
        assert all(r.token_id == test_token.id for r in requests)


class TestRedemptionServiceFulfillment:
    """Tests for fulfillment updates."""

    async def test_update_fulfillment_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test successful fulfillment update."""
        service = RedemptionService(db_session)

        # Create request
        request = await service.create_request(
            user_id=test_user.id,
            token_id=test_token.id,
            amount=Decimal("1000"),
            fulfillment_method="cash",
        )

        # Update fulfillment
        updated = await service.update_fulfillment(
            request_id=request.id,
            status="processing",
            notes="Being processed",
        )

        assert updated.status.value == "processing"
        assert updated.notes == "Being processed"

    async def test_update_fulfillment_not_found(
        self, db_session: AsyncSession
    ) -> None:
        """Test updating non-existent request fails."""
        service = RedemptionService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.update_fulfillment(
                request_id=uuid4(),
                status="processing",
            )

        assert exc_info.value.status_code == 404

    async def test_update_fulfillment_complete(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_user: User,
    ) -> None:
        """Test completing fulfillment."""
        service = RedemptionService(db_session)

        request = await service.create_request(
            user_id=test_user.id,
            token_id=test_token.id,
            amount=Decimal("2000"),
            fulfillment_method="physical",
        )

        updated = await service.update_fulfillment(
            request_id=request.id,
            status="fulfilled",
            notes="Gold bars shipped",
        )

        assert updated.status.value == "fulfilled"
        assert updated.fulfilled_at is not None
