"""Shared test fixtures for Cireta RWA Launchpad."""

import os
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Set test environment before importing app modules
os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only-32chars!"
# Fernet key must be 32 url-safe base64-encoded bytes
os.environ["ENCRYPTION_KEY"] = "bDnNwMbS57OD-OlMEJKnKGIG18AjH4UAmp89L0pHLmw="
os.environ["SUMSUB_SECRET_KEY"] = "test-sumsub-secret"
os.environ["SUMSUB_APP_TOKEN"] = "test-sumsub-token"

from apps.api.main import app
from apps.api.models.enums import (
    AssetType,
    IssuerStatus,
    KYCStatus,
    SaleStatus,
    UserRole,
)
from apps.api.models.issuer import Issuer
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.auth_service import CiretaAuthService
from packages.common.db.base import Base
from packages.common.db.session import get_db

# Test database setup
SQLALCHEMY_TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine = create_async_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestingSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Override the get_db dependency for tests."""
    async with TestingSessionLocal() as session:
        yield session


# Override the get_db dependency
app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="session")
async def setup_database() -> AsyncGenerator[None, None]:
    """Create database tables before tests, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session(
    setup_database: None,  # noqa: ARG001
) -> AsyncGenerator[AsyncSession, None]:
    """Get a test database session with transaction rollback."""
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(
    setup_database: None,  # noqa: ARG001
) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_service(db_session: AsyncSession) -> CiretaAuthService:
    """Create an auth service instance."""
    return CiretaAuthService(db_session)


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User()
    user.id = uuid4()
    user.email = f"test_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.INVESTOR
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 2

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_issuer_user(db_session: AsyncSession) -> User:
    """Create a test issuer user."""
    user = User()
    user.id = uuid4()
    user.email = f"issuer_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.ISSUER
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 3

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_admin_user(db_session: AsyncSession) -> User:
    """Create a test admin user."""
    user = User()
    user.id = uuid4()
    user.email = f"admin_{uuid4().hex[:8]}@example.com"
    user.hashed_password = "$2b$12$test.hash"
    user.role = UserRole.ADMIN
    user.kyc_status = KYCStatus.APPROVED
    user.kyc_level = 3

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_issuer(db_session: AsyncSession, test_issuer_user: User) -> Issuer:
    """Create a test issuer."""
    issuer = Issuer()
    issuer.id = uuid4()
    issuer.user_id = test_issuer_user.id
    issuer.name = "Test Issuer"
    issuer.slug = f"test-issuer-{uuid4().hex[:8]}"
    issuer.wallet_address = "0x" + "a" * 40
    issuer.fee_bps = 200
    issuer.status = IssuerStatus.ACTIVE
    issuer.legal_entity_name = "Test Issuer LLC"
    issuer.jurisdiction = "US"

    db_session.add(issuer)
    await db_session.commit()
    await db_session.refresh(issuer)
    return issuer


@pytest_asyncio.fixture
async def test_token(db_session: AsyncSession, test_issuer: Issuer) -> Token:
    """Create a test token."""
    token = Token()
    token.id = uuid4()
    token.issuer_id = test_issuer.id
    token.name = "Test Gold Token"
    token.symbol = f"TGT{uuid4().hex[:4].upper()}"
    token.asset_type = AssetType.COMMODITY
    token.total_supply = Decimal("1000000")
    token.decimals = 18
    token.chain_id = 8453
    # contract_address intentionally left None — set it explicitly in tests that need a deployed token

    db_session.add(token)
    await db_session.commit()
    await db_session.refresh(token)
    return token



@pytest_asyncio.fixture
async def test_sale(db_session: AsyncSession, test_token: Token, test_issuer: Issuer) -> TokenSale:
    """Create a test token sale with phases."""
    sale = TokenSale()
    sale.id = uuid4()
    sale.token_id = test_token.id
    sale.issuer_id = test_issuer.id
    sale.payment_token = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"  # USDC on Base
    sale.soft_cap = Decimal("100000")
    sale.hard_cap = Decimal("500000")
    sale.status = SaleStatus.ACTIVE
    sale.total_raised = Decimal("0")

    db_session.add(sale)
    await db_session.flush()

    # Create phases
    now = datetime.now(UTC)
    phase1 = SalePhase()
    phase1.id = uuid4()
    phase1.sale_id = sale.id
    phase1.phase_number = 1
    phase1.name = "Private Sale"
    phase1.price_per_token = Decimal("1.00")
    phase1.allocation = Decimal("100000")
    phase1.min_contribution = Decimal("100")
    phase1.max_contribution = Decimal("50000")
    phase1.start_time = now - timedelta(days=1)
    phase1.end_time = now + timedelta(days=30)
    phase1.whitelist_only = False

    phase2 = SalePhase()
    phase2.id = uuid4()
    phase2.sale_id = sale.id
    phase2.phase_number = 2
    phase2.name = "Public Sale"
    phase2.price_per_token = Decimal("1.20")
    phase2.allocation = Decimal("200000")
    phase2.min_contribution = Decimal("50")
    phase2.max_contribution = Decimal("100000")
    phase2.start_time = now + timedelta(days=30)
    phase2.end_time = now + timedelta(days=60)
    phase2.whitelist_only = False

    db_session.add(phase1)
    db_session.add(phase2)
    await db_session.commit()
    await db_session.refresh(sale)

    return sale


@pytest.fixture
def auth_headers(test_user: User, auth_service: CiretaAuthService) -> dict[str, str]:
    """Generate authorization headers for test user."""
    access_token = auth_service.create_access_token(test_user.id)
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def issuer_auth_headers(test_issuer_user: User, auth_service: CiretaAuthService) -> dict[str, str]:
    """Generate authorization headers for issuer user."""
    access_token = auth_service.create_access_token(test_issuer_user.id)
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def admin_auth_headers(test_admin_user: User, auth_service: CiretaAuthService) -> dict[str, str]:
    """Generate authorization headers for admin user."""
    access_token = auth_service.create_access_token(test_admin_user.id)
    return {"Authorization": f"Bearer {access_token}"}


def make_tx_hash() -> str:
    """Generate a unique transaction hash."""
    return "0x" + uuid4().hex + uuid4().hex[:32]
