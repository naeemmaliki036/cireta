"""Add sale_structure column to token_sales.

Revision ID: 016_sale_structure
Revises: 015_coming_soon_and_vesting
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op


revision = "016_sale_structure"
down_revision = "015_coming_soon_and_vesting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "token_sales",
        sa.Column("sale_structure", sa.String(20), nullable=False, server_default="phase_allocated"),
    )


def downgrade() -> None:
    op.drop_column("token_sales", "sale_structure")
