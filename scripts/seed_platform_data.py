"""Seed platform stats, partners, and team members.

Idempotent — checks for existing records before inserting.

Usage:
    python -m scripts.seed_platform_data
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from apps.api.models.partner import Partner
from apps.api.models.platform_stat import PlatformStat
from apps.api.models.team_member import TeamMember
from packages.common.db.session import engine

ASYNC_SESSION = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

STATS = [
    {"key": "funds_raised", "value": "$209M+", "label": "Funds Raised", "sort_order": 1},
    {"key": "partnerships", "value": "15+", "label": "Partnerships", "sort_order": 2},
    {"key": "live_projects", "value": "6+", "label": "Live Projects", "sort_order": 3},
    {"key": "insurance", "value": "105%", "label": "Credit Risk Insurance", "sort_order": 4},
    {"key": "certification", "value": "NI43-101", "label": "& JORC Certified", "sort_order": 5},
    {"key": "legacy", "value": "189+ yrs", "label": "A&M Group Legacy", "sort_order": 6},
]

PARTNERS = [
    {"name": "Veduta", "sort_order": 1},
    {"name": "SANY", "sort_order": 2},
    {"name": "A&M Development Group", "sort_order": 3},
    {"name": "VANAR", "sort_order": 4},
    {"name": "Evergon", "sort_order": 5},
    {"name": "Nexera", "sort_order": 6},
    {"name": "RWA Technology", "sort_order": 7},
    {"name": "Fintech Harbor Consulting", "sort_order": 8},
    {"name": "Compilot", "sort_order": 9},
    {"name": "SL2 Capital", "sort_order": 10},
    {"name": "Digital Terrain", "sort_order": 11},
    {"name": "Noble", "sort_order": 12},
    {"name": "BitcoinMind", "sort_order": 13},
    {"name": "Daewoo", "sort_order": 14},
]

TEAM = [
    {
        "name": "David Edwards",
        "title": "Chief Executive Officer",
        "bio": (
            "International executive with decades of leadership across finance, "
            "restructuring, and infrastructure. Leads Cireta's vision for compliant, "
            "scalable real-world asset tokenization."
        ),
        "sort_order": 1,
    },
    {
        "name": "Rebecca Hall",
        "title": "Chief Operating Officer",
        "bio": (
            "Chartered investment professional driving operational execution, "
            "compliance, and delivery across Cireta's tokenized asset portfolio."
        ),
        "sort_order": 2,
    },
]


async def seed() -> None:
    """Seed platform content data (idempotent)."""
    async with ASYNC_SESSION() as db:
        # --- Stats ---
        for stat_data in STATS:
            result = await db.execute(
                select(PlatformStat).where(PlatformStat.key == stat_data["key"])
            )
            if not result.scalar_one_or_none():
                db.add(PlatformStat(**stat_data))
                print(f"  + Stat: {stat_data['key']}")
            else:
                print(f"  = Stat: {stat_data['key']} (exists)")

        # --- Partners ---
        for partner_data in PARTNERS:
            result = await db.execute(
                select(Partner).where(Partner.name == partner_data["name"])
            )
            if not result.scalar_one_or_none():
                db.add(Partner(**partner_data))
                print(f"  + Partner: {partner_data['name']}")
            else:
                print(f"  = Partner: {partner_data['name']} (exists)")

        # --- Team ---
        for member_data in TEAM:
            result = await db.execute(
                select(TeamMember).where(TeamMember.name == member_data["name"])
            )
            if not result.scalar_one_or_none():
                db.add(TeamMember(**member_data))
                print(f"  + Team: {member_data['name']}")
            else:
                print(f"  = Team: {member_data['name']} (exists)")

        await db.commit()
        print("\nPlatform data seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
