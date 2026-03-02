"""Seed script — creates issuer, tokens, and active sales for dev/demo."""
import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from apps.api.models.enums import AssetType, IssuerStatus, KYCStatus, SaleStatus, UserRole
from apps.api.models.issuer import Issuer
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from packages.common.core.config import get_settings
from packages.common.services.auth_service import AuthService

settings = get_settings()

ENGINE = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = sessionmaker(ENGINE, class_=AsyncSession, expire_on_commit=False)

PROJECTS = [
    {
        "name": "West African Gold Reserve",
        "symbol": "WAGR",
        "asset_type": AssetType.COMMODITY,
        "slug": "west-african-gold",
        "description": "Tokenized gold reserves from certified Ghanaian mines. Each WAGR token represents 1g of LBMA-certified gold held in Zurich vaults.",
        "soft_cap": Decimal("500000"),
        "hard_cap": Decimal("2000000"),
        "total_raised": Decimal("1240000"),
        "price_per_token": Decimal("65.0"),
        "allocation": Decimal("30769"),
        "min_contribution": Decimal("500"),
        "max_contribution": Decimal("100000"),
    },
    {
        "name": "Chilean Copper Fund",
        "symbol": "CCF",
        "asset_type": AssetType.COMMODITY,
        "slug": "chilean-copper",
        "description": "Exposure to premium Chilean copper production. Backed by forward contracts with Codelco-certified extraction operations.",
        "soft_cap": Decimal("300000"),
        "hard_cap": Decimal("1000000"),
        "total_raised": Decimal("320000"),
        "price_per_token": Decimal("12.5"),
        "allocation": Decimal("80000"),
        "min_contribution": Decimal("250"),
        "max_contribution": Decimal("50000"),
    },
    {
        "name": "Commodity Futures Index",
        "symbol": "CFI",
        "asset_type": AssetType.FUTURES,
        "slug": "commodity-futures-index",
        "description": "Diversified basket of agricultural and energy futures. Monthly rebalancing. Institutional-grade exposure to global commodity markets.",
        "soft_cap": Decimal("1000000"),
        "hard_cap": Decimal("5000000"),
        "total_raised": Decimal("780000"),
        "price_per_token": Decimal("100.0"),
        "allocation": Decimal("50000"),
        "min_contribution": Decimal("1000"),
        "max_contribution": Decimal("500000"),
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # Create platform admin + issuer user
        auth = AuthService(db)

        # Check if already seeded
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "issuer@cireta.com"))
        existing = result.scalar_one_or_none()
        if existing:
            print("Already seeded — skipping.")
            return

        print("Creating users...")
        issuer_user = User(
            id=uuid4(),
            email="issuer@cireta.com",
            hashed_password=auth.hash_password("Cireta26"),
            role=UserRole.ISSUER,
            kyc_status=KYCStatus.APPROVED,
            kyc_level=2,
        )
        admin_user = User(
            id=uuid4(),
            email="admin@cireta.com",
            hashed_password=auth.hash_password("Cireta26"),
            role=UserRole.ADMIN,
            kyc_status=KYCStatus.APPROVED,
            kyc_level=2,
        )
        investor_user = User(
            id=uuid4(),
            email="investor@cireta.com",
            hashed_password=auth.hash_password("Cireta26"),
            role=UserRole.INVESTOR,
            kyc_status=KYCStatus.APPROVED,
            kyc_level=2,
        )
        db.add_all([issuer_user, admin_user, investor_user])
        await db.flush()

        print("Creating issuer...")
        issuer = Issuer(
            id=uuid4(),
            user_id=issuer_user.id,
            name="Cireta Capital",
            slug="cireta-capital",
            wallet_address="0xBE84C7a8f44F673173d51C0A212C9C66267066A0",
            fee_bps=200,
            status=IssuerStatus.ACTIVE,
            legal_entity_name="Cireta Capital Ltd",
            jurisdiction="BVI",
        )
        db.add(issuer)
        await db.flush()

        now = datetime.now(UTC)

        for proj in PROJECTS:
            print(f"Creating {proj['name']}...")
            token = Token(
                id=uuid4(),
                issuer_id=issuer.id,
                name=proj["name"],
                symbol=proj["symbol"],
                asset_type=proj["asset_type"],
                slug=proj["slug"],
                description=proj.get("description", ""),
                total_supply=proj["hard_cap"] / proj["price_per_token"],
                decimals=18,
                chain_id=8453,
                is_paused=False,
            )
            db.add(token)
            await db.flush()

            sale = TokenSale(
                id=uuid4(),
                token_id=token.id,
                issuer_id=issuer.id,
                payment_token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC Base
                soft_cap=proj["soft_cap"],
                hard_cap=proj["hard_cap"],
                total_raised=proj["total_raised"],
                status=SaleStatus.ACTIVE,
            )
            db.add(sale)
            await db.flush()

            phase = SalePhase(
                id=uuid4(),
                sale_id=sale.id,
                phase_number=1,
                name="Public Sale",
                price_per_token=proj["price_per_token"],
                allocation=proj["allocation"],
                min_contribution=proj["min_contribution"],
                max_contribution=proj["max_contribution"],
                start_time=now - timedelta(days=7),
                end_time=now + timedelta(days=30),
                whitelist_only=False,
            )
            db.add(phase)

        await db.commit()
        print("✅ Seed complete!")
        print("  issuer@cireta.com / Cireta26")
        print("  admin@cireta.com / Cireta26")
        print("  investor@cireta.com / Cireta26")


if __name__ == "__main__":
    asyncio.run(seed())
