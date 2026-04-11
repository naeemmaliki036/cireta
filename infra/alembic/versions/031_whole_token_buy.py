"""Add min_tokens, max_tokens, top_up_min_tokens columns to sale_phases.

Whole-token buy model: phase limits are now in whole token units instead of USDC.

Revision ID: 031_whole_token_buy
Revises: 030_sale_display_order
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "031_whole_token_buy"
down_revision = "030_sale_display_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sale_phases",
        sa.Column("min_tokens", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "sale_phases",
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sale_phases",
        sa.Column("top_up_min_tokens", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("sale_phases", "top_up_min_tokens")
    op.drop_column("sale_phases", "max_tokens")
    op.drop_column("sale_phases", "min_tokens")
