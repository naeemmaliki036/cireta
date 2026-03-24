"""Tests for MFA service."""

from uuid import uuid4

import pyotp
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import KYCStatus, UserRole
from apps.api.models.user import User
from apps.api.services.mfa_service import MFAService


@pytest_asyncio.fixture
async def mfa_user(db_session: AsyncSession) -> User:
    user = User()
    user.id = uuid4()
    user.email = f"mfa_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.INVESTOR
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 2
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_setup_mfa(db_session: AsyncSession, mfa_user: User) -> None:
    """setup_mfa generates secret and URI."""
    svc = MFAService(db_session)
    result = svc.setup_mfa(mfa_user)
    assert "secret" in result
    assert "uri" in result
    assert "otpauth://" in result["uri"]
    assert mfa_user.mfa_secret == result["secret"]


@pytest.mark.asyncio
async def test_verify_mfa_valid_code(db_session: AsyncSession, mfa_user: User) -> None:
    """verify_mfa returns True for valid TOTP code."""
    svc = MFAService(db_session)
    result = svc.setup_mfa(mfa_user)
    totp = pyotp.TOTP(result["secret"])
    code = totp.now()
    assert svc.verify_mfa(mfa_user, code) is True


@pytest.mark.asyncio
async def test_verify_mfa_invalid_code(db_session: AsyncSession, mfa_user: User) -> None:
    """verify_mfa returns False for invalid code."""
    svc = MFAService(db_session)
    svc.setup_mfa(mfa_user)
    assert svc.verify_mfa(mfa_user, "000000") is False


@pytest.mark.asyncio
async def test_generate_backup_codes(db_session: AsyncSession, mfa_user: User) -> None:
    """generate_backup_codes returns 8 unique codes."""
    svc = MFAService(db_session)
    codes = svc.generate_backup_codes(mfa_user)
    assert len(codes) == 8
    assert len(set(codes)) == 8
    assert mfa_user.mfa_backup_codes is not None


@pytest.mark.asyncio
async def test_verify_backup_code(db_session: AsyncSession, mfa_user: User) -> None:
    """Backup code works and is consumed."""
    svc = MFAService(db_session)
    svc.setup_mfa(mfa_user)
    codes = svc.generate_backup_codes(mfa_user)
    first_code = codes[0]

    assert svc.verify_mfa(mfa_user, first_code) is True
    # Code consumed — should not work again
    assert svc.verify_mfa(mfa_user, first_code) is False


@pytest.mark.asyncio
async def test_enable_mfa(db_session: AsyncSession, mfa_user: User) -> None:
    """enable_mfa sets mfa_enabled and returns backup codes."""
    svc = MFAService(db_session)
    result = svc.setup_mfa(mfa_user)
    totp = pyotp.TOTP(result["secret"])
    code = totp.now()

    backup_codes = await svc.enable_mfa(mfa_user, code)
    assert mfa_user.mfa_enabled is True
    assert len(backup_codes) == 8


@pytest.mark.asyncio
async def test_enable_mfa_bad_code(db_session: AsyncSession, mfa_user: User) -> None:
    """enable_mfa raises on invalid code."""
    from fastapi import HTTPException

    svc = MFAService(db_session)
    svc.setup_mfa(mfa_user)

    with pytest.raises(HTTPException) as exc_info:
        await svc.enable_mfa(mfa_user, "000000")
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_disable_mfa(db_session: AsyncSession, mfa_user: User) -> None:
    """disable_mfa clears MFA state."""
    svc = MFAService(db_session)
    result = svc.setup_mfa(mfa_user)
    totp = pyotp.TOTP(result["secret"])
    code = totp.now()
    await svc.enable_mfa(mfa_user, code)

    code2 = totp.now()
    await svc.disable_mfa(mfa_user, code2)
    assert mfa_user.mfa_enabled is False
    assert mfa_user.mfa_secret is None
