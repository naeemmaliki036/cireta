#!/usr/bin/env python3
"""Check if a wallet address is registered as an issuer."""

import asyncio
import os
import sys
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from packages.common.db.session import engine


async def check_issuer_wallet(wallet_address: str) -> None:
    """Check if the given wallet address is registered as an issuer."""

    async with AsyncSession(engine) as session:
        # Query for issuer with the given wallet address
        result = await session.execute(
            select(Issuer).where(Issuer.wallet_address == wallet_address)
        )
        issuer = result.scalar_one_or_none()

        if issuer:
            print(f"✅ FOUND: Wallet {wallet_address} is registered as an issuer")
            print(f"   Issuer ID: {issuer.id}")
            print(f"   Name: {issuer.name}")
            print(f"   Slug: {issuer.slug}")
            print(f"   Status: {issuer.status}")
            print(f"   Wallet Status: {issuer.wallet_status}")
            print(f"   Created: {issuer.created_at}")
        else:
            print(f"❌ NOT FOUND: Wallet {wallet_address} is not registered as an issuer")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python check_issuer_wallet.py <wallet_address>")
        print("Example: python check_issuer_wallet.py 0x620e787cD7D241E4e9E0DA2FcFA3CDBc60Ae00F0")
        sys.exit(1)

    wallet_address = sys.argv[1]
    asyncio.run(check_issuer_wallet(wallet_address))