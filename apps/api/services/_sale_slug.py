"""Sale slug helpers — derivation from title and uniqueness enforcement.

Slugs live on token_sales and must be unique across all sales (not just
per token), so an issuer can run multiple sales for the same token (seed
→ public). The schema validates format; this module owns derivation and
collision resolution against the live DB.
"""

import re
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.token_sale import TokenSale

_NON_SLUG = re.compile(r"[^a-z0-9]+")
_SLUG_MAX = 100
_SLUG_MIN = 3


def slugify(text: str | None) -> str:
    """Lowercase, collapse non-alnum runs to '-', trim, cap at 100 chars."""
    if not text:
        return ""
    s = _NON_SLUG.sub("-", text.lower()).strip("-")
    return s[:_SLUG_MAX]


async def is_slug_taken(
    db: AsyncSession,
    slug: str,
    exclude_id: UUID | None = None,
) -> bool:
    """True if any sale already uses this slug (excluding ``exclude_id``)."""
    query = select(func.count()).select_from(TokenSale).where(
        func.lower(TokenSale.slug) == slug.lower()
    )
    if exclude_id is not None:
        query = query.where(TokenSale.id != exclude_id)
    return ((await db.execute(query)).scalar() or 0) > 0


async def ensure_unique_slug(
    db: AsyncSession,
    base: str,
    exclude_id: UUID | None = None,
) -> str:
    """Return ``base``, or ``base-2``/``base-3``/... if it's taken.

    Falls back to ``sale-<random>`` if ``base`` is empty after slugify
    so we never return an invalid slug from auto-derivation.
    """
    if not base:
        from secrets import token_hex
        base = f"sale-{token_hex(4)}"
    if len(base) < _SLUG_MIN:
        base = f"{base}-sale"

    candidate = base
    n = 2
    while await is_slug_taken(db, candidate, exclude_id=exclude_id):
        suffix = f"-{n}"
        # Trim base so candidate stays under _SLUG_MAX
        trimmed = base[: _SLUG_MAX - len(suffix)]
        candidate = f"{trimmed}{suffix}"
        n += 1
        if n > 1000:
            from secrets import token_hex
            candidate = f"{base[: _SLUG_MAX - 9]}-{token_hex(4)}"
            break
    return candidate


async def derive_slug_from_title(
    db: AsyncSession,
    title: str | None,
    fallback: str | None = None,
) -> str:
    """Derive a unique slug from ``title``, with a ``fallback`` (e.g. token slug)."""
    base = slugify(title) or slugify(fallback) or "sale"
    return await ensure_unique_slug(db, base)
