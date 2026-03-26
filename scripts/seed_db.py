
import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from passlib.context import CryptContext
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from apps.api.models.audit_log import AuditLog
from apps.api.models.contribution import Contribution
from apps.api.models.enums import (
    AssetType,
    ContributionStatus,
    KYCStatus,
    SaleMode,
    SaleStatus,
    UserRole,
)
from apps.api.models.issuer import Issuer
from apps.api.models.kyc_application import KYCApplication
from apps.api.models.notification import Notification
from apps.api.models.notification_preferences import NotificationPreferences
from apps.api.models.platform_settings import PlatformSettings
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_document import TokenDocument
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.models.vault_snapshot import VaultSnapshot
from apps.api.models.vesting_schedule import VestingSchedule
from apps.api.models.wallet import Wallet
from packages.common.core.config import settings
from packages.common.db.session import engine


# --- Configuration ---
PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")
ASYNC_SESSION_LOCAL = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# --- Helper Functions ---
def get_password_hash(password: str) -> str:
    return PWD_CONTEXT.hash(password)

async def _get_or_create(session: AsyncSession, model: Any, **kwargs: Any) -> Any:
    instance = await session.execute(
        select(model).filter_by(**kwargs)
    )
    instance = instance.scalar_one_or_none()
    if instance:
        return instance
    instance = model(**kwargs)
    session.add(instance)
    await session.flush()
    return instance

async def seed_data() -> None:
    async with ASYNC_SESSION_LOCAL() as session:
        print("Bismillah. Seeding database...")

        # 1. Clear existing data (order matters due to foreign keys)
        print("Clearing existing data...")
        await session.execute(delete(AuditLog))
        await session.execute(delete(Notification))
        await session.execute(delete(NotificationPreferences))
        await session.execute(delete(RedemptionRequest))
        await session.execute(delete(Contribution))
        await session.execute(delete(SalePhase))
        await session.execute(delete(VaultSnapshot)) # Clear before TokenSale
        await session.execute(delete(TokenSale))
        await session.execute(delete(TokenDocument))
        await session.execute(delete(VestingSchedule))
        await session.execute(delete(Wallet))
        await session.execute(delete(KYCApplication))
        await session.execute(delete(Issuer))
        await session.execute(delete(Token))
        await session.execute(delete(User))
        await session.execute(delete(PlatformSettings))
        await session.commit()

        # 2. Users
        print("Creating users...")
        users = {}
        for email, role, kyc_status, password, display_name, kyc_level in [
            ("admin@cireta.io", UserRole.ADMIN, KYCStatus.APPROVED, "AdminPass123!", "Cireta Admin", 2),
            ("issuer@goldcorp.io", UserRole.ISSUER, KYCStatus.APPROVED, "IssuerPass123!", "GoldCorp Issuer", 2),
            ("alice@investor.io", UserRole.INVESTOR, KYCStatus.APPROVED, "AlicePass123!", "Alice Smith", 2),
            ("bob@investor.io", UserRole.INVESTOR, KYCStatus.PENDING, "BobPass123!", "Bob Johnson", 1),
            ("charlie@investor.io", UserRole.INVESTOR, KYCStatus.NONE, "CharliePass123!", "Charlie Brown", 0),
            ("eve@blocked.io", UserRole.INVESTOR, KYCStatus.BLOCKED, "EvePass123!", "Eve Black", 0),
        ]:
            user_obj = User(
                email=email,
                hashed_password=get_password_hash(password),
                display_name=display_name,
                role=role,
                email_verified=True,
                email_verified_at=datetime.now(UTC),
                kyc_status=kyc_status,
                kyc_level=kyc_level,
                walletconnect_id=f"wc-{email.split('@')[0]}", # Dummy ID
            )
            session.add(user_obj)
            await session.flush() # Populate ID for relationships
            users[email.split('@')[0]] = user_obj
            print(f"  Created user: {email} ({role})")
            
        # 3. Create Issuer profile for 'issuer@goldcorp.io'
        print("Creating issuer profile...")
        issuer_user = users["goldcorp"]
        issuer = Issuer(
            user_id=issuer_user.id,
            legal_entity_name="GoldCorp Inc.",
            jurisdiction="Dubai, UAE",
            wallet_address="0x" + "bb" * 20, # Dummy address
            status="active",
        )
        session.add(issuer)
        await session.flush()
        print(f"  Created issuer: {issuer.legal_entity_name}")

        # 4. Create Token for GoldCorp Issuer
        print("Creating token...")
        token = Token(
            issuer_id=issuer.id,
            name="Test Gold Token",
            symbol="TGLD",
            asset_type=AssetType.COMMODITY,
            contract_address="0x" + "ca" * 20, # Dummy deployed address
            chain_id=settings.chain_id,
            total_supply=Decimal("1000000.00"),
            decimals=18,
            ipfs_docs_hash="Qm...TGLDDOC", # Dummy IPFS hash
            slug="test-gold-token",
            description="ERC-3643 compliant token representing a fractional share of physical gold.",
            image_url="https://example.com/tgld.png",
            identity_registry_address="0x" + "cb" * 20,
            compliance_address="0x" + "cc" * 20,
            sale_contract_address="0x" + "cd" * 20,
            vault_address="0x" + "ce" * 20,
            fraction_token_address="0x" + "cf" * 20,
        )
        session.add(token)
        await session.flush()
        print(f"  Created token: {token.name} ({token.symbol})")

        # 5. Create Token Sale for TGLD (Vested Mode)
        print("Creating vested token sale...")
        now = datetime.now(UTC)
        sale = TokenSale(
            token_id=token.id,
            issuer_id=issuer.id,
            payment_token="0x" + "dd" * 20, # Dummy USDC address
            soft_cap=Decimal("100000.00"),
            hard_cap=Decimal("500000.00"),
            status=SaleStatus.DRAFT,
            platform_fee_bps=250,
            sale_mode=SaleMode.VESTED,
            contract_address="0x" + "da" * 20, # Dummy sale contract address
            vault_address="0x" + "db" * 20, # Dummy vault address
            fraction_token_address="0x" + "df" * 20, # Dummy fraction token address
        )
        session.add(sale)
        await session.flush()

        # Add Sale Phases
        phase1 = SalePhase(
            sale_id=sale.id,
            phase_number=0,
            name="Seed Round",
            price_per_token=Decimal("1.50"),
            allocation=Decimal("50000.00"),
            min_contribution=Decimal("1000.00"),
            max_contribution=Decimal("10000.00"),
            start_time=now - timedelta(days=7),
            end_time=now + timedelta(days=7),
            whitelist_only=True,
        )
        phase2 = SalePhase(
            sale_id=sale.id,
            phase_number=1,
            name="Public Round",
            price_per_token=Decimal("2.00"),
            allocation=Decimal("200000.00"),
            min_contribution=Decimal("100.00"),
            max_contribution=Decimal("5000.00"),
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=14),
            whitelist_only=False,
        )
        session.add_all([phase1, phase2])
        await session.flush()
        print(f"  Created sale: {sale.id} with 2 phases")

        # 6. Add a contribution (Alice to Public Round)
        print("Adding contribution...")
        alice_user = users["alice"]
        contribution = Contribution(
            user_id=alice_user.id,
            sale_id=sale.id,
            phase_id=phase2.id,
            wallet_address="0x" + "ae" * 20, # Alice's dummy wallet
            amount=Decimal("500.00"), # 500 USDC
            tokens_allocated=Decimal("250.00"), # 500/2 = 250 TGLD
            tx_hash="0x" + "cf" * 32, # Dummy tx hash
            status=ContributionStatus.PENDING, # Pending claim
        )
        session.add(contribution)
        await session.flush()
        print(f"  Added contribution from Alice to sale {sale.id}")
        
        # 7. Platform Settings
        print("Creating placeholder platform settings...")
        settings_obj = PlatformSettings(
            id=UUID("00000000-0000-0000-0000-000000000001"), # Fixed ID
            key="platform_name", 
            value="Cireta RWA Launchpad"
        )
        await session.merge(settings_obj) # Use merge to prevent PK conflict on re-run
        await session.commit()
        print("Database seeding complete.")

if __name__ == "__main__":
    from sqlalchemy import select
    from apps.api.models.base import Base # Import Base for metadata

    async def init_db_and_seed():
        # Ensure tables are created before seeding if not already
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await seed_data()

    asyncio.run(init_db_and_seed())

