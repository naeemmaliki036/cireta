#!/usr/bin/env python3
"""List all registered issuer wallets."""

import asyncio
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from packages.common.db.session import engine


async def list_issuer_wallets() -> None:
    """List all registered issuer wallets."""
    async with AsyncSession(engine) as session:
        # Query for all issuers with wallet addresses
        result = await session.execute(
            select(Issuer).where(Issuer.wallet_address.isnot(None))
            .order_by(Issuer.created_at.desc())
        )
        issuers = result.scalars().all()

        if not issuers:
            print("No issuers found with wallet addresses.")
            return

        print(f"Found {len(issuers)} issuers with wallet addresses:")
        print()

        for i, issuer in enumerate(issuers, 1):
            print(f"{i}. {issuer.name} ({issuer.slug})")
            print(f"   Wallet: {issuer.wallet_address}")
            print(f"   Status: {issuer.status}")
            print(f"   Wallet Status: {issuer.wallet_status}")
            print(f"   Created: {issuer.created_at}")
            print()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(list_issuer_wallets())