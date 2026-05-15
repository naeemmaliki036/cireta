"""Insert every key in DEFAULT_TEMPLATES into the email_templates table if
not already present. Idempotent. Run against any environment via DATABASE_URL.

Usage:
    DATABASE_URL=postgresql+asyncpg://... poetry run python scripts/seed_email_templates.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.email_template import EmailTemplate
from apps.api.services.email_service import DEFAULT_TEMPLATES
from packages.common.db.session import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed-emails")


async def upsert(db: AsyncSession) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    for key, tpl in DEFAULT_TEMPLATES.items():
        existing = await db.execute(
            select(EmailTemplate).where(EmailTemplate.key == key)
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue
        row = EmailTemplate(
            id=uuid4(),
            key=key,
            subject=tpl["subject"],
            html_body=tpl["html_body"],
            description=tpl.get("description"),
            is_active=True,
        )
        db.add(row)
        inserted += 1
        log.info("inserted: %s", key)
    await db.commit()
    return inserted, skipped


async def main() -> int:
    async with AsyncSessionLocal() as db:
        inserted, skipped = await upsert(db)
    log.info("done. inserted=%d skipped=%d total=%d", inserted, skipped, inserted + skipped)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
