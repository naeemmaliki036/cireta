"""Add unique slug column to token_sales with backfill.

Per-sale URL slug. An issuer can run multiple sales for the same token
(seed → public), so the slug needs to live on token_sales, not tokens.
Backfill derives a slug from the sale title (or token slug, or sale id
prefix as last resort) and appends -2/-3/... when collisions occur.

Revision ID: 045_token_sale_slug
Revises: 044_phase_token_count_numeric
Create Date: 2026-04-30
"""

import re

import sqlalchemy as sa
from alembic import op

revision = "045_token_sale_slug"
down_revision = "044_phase_token_count_numeric"
branch_labels = None
depends_on = None


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str | None) -> str:
    if not text:
        return ""
    s = _SLUG_RE.sub("-", text.lower()).strip("-")
    return s[:100]


def upgrade() -> None:
    # Add the column nullable + unique. We backfill below before any
    # production code starts populating it.
    op.add_column(
        "token_sales",
        sa.Column("slug", sa.String(length=120), nullable=True),
    )
    op.create_index("ix_token_sales_slug", "token_sales", ["slug"], unique=True)

    # Backfill: pull sales with their token slug as a hint, slugify the
    # title (preferred) or token slug or sale id prefix, and increment
    # a suffix until unique.
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT s.id::text AS id, s.title, t.slug AS token_slug
            FROM token_sales s
            LEFT JOIN tokens t ON s.token_id = t.id
            ORDER BY s.created_at ASC
            """
        )
    ).fetchall()

    used: set[str] = set()
    for row in rows:
        sale_id = row.id
        title = row.title
        token_slug = row.token_slug

        base = _slugify(title) or _slugify(token_slug) or f"sale-{sale_id[:8]}"
        candidate = base
        n = 2
        while candidate in used:
            candidate = f"{base}-{n}"[:120]
            n += 1
        used.add(candidate)

        bind.execute(
            sa.text("UPDATE token_sales SET slug = :slug WHERE id = :id"),
            {"slug": candidate, "id": sale_id},
        )

    # Sanity check: make sure no nulls remain. New rows are required to
    # provide a slug at the application layer; we keep the column NULLable
    # at the DB level so legacy code paths that haven't been updated yet
    # don't crash on insert before the next deploy. Application-level
    # validation enforces non-empty.
    null_count = bind.execute(
        sa.text("SELECT COUNT(*) FROM token_sales WHERE slug IS NULL")
    ).scalar()
    if null_count and null_count > 0:
        raise RuntimeError(f"Backfill missed {null_count} rows; refusing to continue")


def downgrade() -> None:
    op.drop_index("ix_token_sales_slug", table_name="token_sales")
    op.drop_column("token_sales", "slug")
