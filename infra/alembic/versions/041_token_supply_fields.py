"""Add max_supply, mintable, current_supply to tokens table.

Backfills the existing WGGH token: max_supply = total_supply, mintable = true.

Revision ID: 041_token_supply_fields
Revises: 040_payment_tokens
Create Date: 2026-04-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "041_token_supply_fields"
down_revision = "040_payment_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add max_supply — nullable (existing tokens won't have it until backfilled)
    op.add_column(
        "tokens",
        sa.Column(
            "max_supply",
            sa.Numeric(precision=78, scale=18),
            nullable=True,
        ),
    )

    # Add mintable — non-nullable with server default true for backward compat
    op.add_column(
        "tokens",
        sa.Column(
            "mintable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # Add current_supply — nullable (cached value refreshed from chain on read)
    op.add_column(
        "tokens",
        sa.Column(
            "current_supply",
            sa.Numeric(precision=78, scale=18),
            nullable=True,
        ),
    )

    # Backfill: for all existing tokens set max_supply = total_supply, mintable = true
    # (only WGGH exists post-cleanup; this is safe to run on any existing row)
    op.execute(
        """
        UPDATE tokens
        SET max_supply = total_supply,
            mintable   = true
        WHERE max_supply IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("tokens", "current_supply")
    op.drop_column("tokens", "mintable")
    op.drop_column("tokens", "max_supply")
