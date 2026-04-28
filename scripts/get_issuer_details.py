#!/usr/bin/env python3
"""Get issuer details by wallet address."""

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


async def get_issuer_details(wallet_address: str) -> None:
    """Get issuer details by wallet address."""
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(Issuer).where(Issuer.wallet_address == wallet_address)
        )
        issuer = result.scalar_one_or_none()

        if issuer:
            print(f"✅ FOUND: Issuer details for wallet {wallet_address}")
            print(f"   Issuer ID: {issuer.id}")
            print(f"   User ID: {issuer.user_id}")
            print(f"   Name: {issuer.name}")
            print(f"   Slug: {issuer.slug}")
            print(f"   Status: {issuer.status}")
            print(f"   Wallet Status: {issuer.wallet_status}")
            print(f"   Identity Status: {issuer.identity_status}")
            print(f"   Fee BPS: {issuer.fee_bps}")
            print(f"   Created: {issuer.created_at}")
            print()
            print("🔧 ADMIN ACTION NEEDED:")
            print(f"   Register on-chain using: POST /api/v1/issuers/{issuer.id}/register-onchain")
            print()
        else:
            print(f"❌ NOT FOUND: No issuer with wallet {wallet_address}")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python get_issuer_details.py <wallet_address>")
        sys.exit(1)

    wallet_address = sys.argv[1]
    asyncio.run(get_issuer_details(wallet_address))