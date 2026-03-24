"""Tests for KYC expiry monitoring service."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import KYCStatus, UserRole
from apps.api.models.user import User
from apps.api.services.kyc_expiry_service import check_expiring_users


@pytest_asyncio.fixture
async def expiring_user(db_session: AsyncSession) -> User:
    """User whose KYC expires in 20 days."""
    user = User()
    user.id = uuid4()
    user.email = f"expiring_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.INVESTOR
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 2
    user.kyc_expires_at = datetime.now(UTC) + timedelta(days=20)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def expired_user(db_session: AsyncSession) -> User:
    """User whose KYC expired yesterday."""
    user = User()
    user.id = uuid4()
    user.email = f"expired_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.INVESTOR
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 2
    user.kyc_expires_at = datetime.now(UTC) - timedelta(days=1)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
@patch("apps.api.services.email_service.send_kyc_expiry_warning", new_callable=AsyncMock)
async def test_warning_sent_for_expiring_user(
    mock_send: AsyncMock,
    db_session: AsyncSession,
    expiring_user: User,  # noqa: ARG001
) -> None:
    """Users expiring within 30 days get a warning email."""
    mock_send.return_value = True
    warned, expired = await check_expiring_users(db_session)
    assert warned >= 1
    mock_send.assert_called()


@pytest.mark.asyncio
async def test_expired_user_blocked(
    db_session: AsyncSession,
    expired_user: User,
) -> None:
    """Expired users get kyc_level=0 and status=EXPIRED."""
    with patch(
        "apps.api.services.email_service.send_kyc_expiry_warning",
        new_callable=AsyncMock,
    ):
        _, expired_count = await check_expiring_users(db_session)

    assert expired_count >= 1
    await db_session.refresh(expired_user)
    assert expired_user.kyc_level == 0
    assert expired_user.kyc_status == KYCStatus.EXPIRED


@pytest.mark.asyncio
async def test_contribute_blocked_for_expired_kyc(
    db_session: AsyncSession,
    expired_user: User,
    test_sale,
) -> None:
    """Contribution is blocked when KYC is expired."""
    from fastapi import HTTPException

    from apps.api.services.sale_contribute_service import SaleContributeService

    # Manually set up user as would-be investor with expired KYC
    expired_user.kyc_status = KYCStatus.APPROVED
    expired_user.kyc_level = 2
    await db_session.commit()

    svc = SaleContributeService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await svc.contribute(
            user_id=expired_user.id,
            sale_id=test_sale.id,
            amount=1000,
            tx_hash="0x" + uuid4().hex + uuid4().hex[:32],
        )
    assert exc_info.value.status_code == 403
    assert "expired" in exc_info.value.detail["message"].lower()
