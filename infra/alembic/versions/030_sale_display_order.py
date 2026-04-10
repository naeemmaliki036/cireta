"""Add display_order column to token_sales for admin-controlled sort.

Revision ID: 030_sale_display_order
Revises: 029_round5_sale_system
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "030_sale_display_order"
down_revision = "029_round5_sale_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "token_sales",
        sa.Column("display_order", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("token_sales", "display_order")
