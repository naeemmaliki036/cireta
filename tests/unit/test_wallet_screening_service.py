"""Tests for wallet screening service."""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import KYCStatus, UserRole
from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from apps.api.services.wallet_screening_service import (
    WalletScreeningProvider,
    WalletScreeningService,
)


class SanctionedProvider(WalletScreeningProvider):
    """Test provider that marks specific addresses as sanctioned."""

    def __init__(self, sanctioned_addresses: set[str] | None = None, risk: float = 0.0):
        self.sanctioned_addresses = sanctioned_addresses or set()
        self.risk = risk

    async def screen(self, address: str) -> dict:
        sanctioned = address.lower() in {a.lower() for a in self.sanctioned_addresses}
        return {"risk_score": 0.95 if sanctioned else self.risk, "sanctioned": sanctioned}


@pytest_asyncio.fixture
async def screening_user(db_session: AsyncSession) -> User:
    user = User()
    user.id = uuid4()
    user.email = f"screen_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.INVESTOR
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 2
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def screening_wallet(db_session: AsyncSession, screening_user: User) -> Wallet:
    wallet = Wallet()
    wallet.id = uuid4()
    wallet.user_id = screening_user.id
    wallet.address = "0x1234567890abcdef1234567890abcdef12345678"
    wallet.address_checksum = "0x1234567890AbcdEF1234567890aBcDEF12345678"
    wallet.is_primary = True
    db_session.add(wallet)
    await db_session.commit()
    await db_session.refresh(wallet)
    return wallet


@pytest.mark.asyncio
async def test_screen_address_clean(db_session: AsyncSession) -> None:
    """Clean address passes screening."""
    svc = WalletScreeningService(db_session)
    result = await svc.screen_address("0xabc123")
    assert result["risk_score"] == 0.0
    assert result["sanctioned"] is False


@pytest.mark.asyncio
async def test_screen_address_sanctioned(db_session: AsyncSession) -> None:
    """Sanctioned address is detected."""
    provider = SanctionedProvider(sanctioned_addresses={"0xBAD"})
    svc = WalletScreeningService(db_session, provider=provider)
    result = await svc.screen_address("0xBAD")
    assert result["sanctioned"] is True
    assert result["risk_score"] >= 0.7


@pytest.mark.asyncio
async def test_check_sanctions_returns_bool(db_session: AsyncSession) -> None:
    """check_sanctions returns True for sanctioned address."""
    provider = SanctionedProvider(sanctioned_addresses={"0xEVIL"})
    svc = WalletScreeningService(db_session, provider=provider)
    assert await svc.check_sanctions("0xEVIL") is True
    assert await svc.check_sanctions("0xGOOD") is False


@pytest.mark.asyncio
async def test_screen_on_link_blocks_sanctioned(db_session: AsyncSession) -> None:
    """screen_on_link raises 403 for sanctioned address."""
    from fastapi import HTTPException

    provider = SanctionedProvider(sanctioned_addresses={"0xBAD"})
    svc = WalletScreeningService(db_session, provider=provider)

    with pytest.raises(HTTPException) as exc_info:
        await svc.screen_on_link("0xBAD")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_screen_on_link_allows_clean(db_session: AsyncSession) -> None:
    """screen_on_link allows clean address."""
    svc = WalletScreeningService(db_session)
    result = await svc.screen_on_link("0xGOOD")
    assert result["sanctioned"] is False


@pytest.mark.asyncio
async def test_screen_before_contribute_blocks_high_risk(
    db_session: AsyncSession, screening_wallet: Wallet
) -> None:
    """screen_before_contribute blocks wallet above block threshold."""
    from fastapi import HTTPException

    provider = SanctionedProvider(risk=0.8)
    svc = WalletScreeningService(db_session, provider=provider)

    with pytest.raises(HTTPException) as exc_info:
        await svc.screen_before_contribute(screening_wallet)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_screen_before_contribute_updates_wallet(
    db_session: AsyncSession, screening_wallet: Wallet
) -> None:
    """screen_before_contribute updates risk_score and last_screened_at."""
    svc = WalletScreeningService(db_session)
    await svc.screen_before_contribute(screening_wallet)
    assert screening_wallet.risk_score == 0.0
    assert screening_wallet.last_screened_at is not None
