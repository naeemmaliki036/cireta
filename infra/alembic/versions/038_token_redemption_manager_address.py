"""Add redemption_manager_address to tokens and is_redeemable to token_sales.

Revision ID: 038_token_redemption_manager_address
Revises: 037_redemption_tracking_number
Create Date: 2026-04-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "038_token_redemption_manager_address"
down_revision = "037_redemption_tracking_number"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tokens",
        sa.Column("redemption_manager_address", sa.String(42), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column("is_redeemable", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("token_sales", "is_redeemable")
    op.drop_column("tokens", "redemption_manager_address")
