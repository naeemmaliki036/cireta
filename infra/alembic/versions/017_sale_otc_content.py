"""Add OTC enabled flag and content to token_sales.

Revision ID: 017_sale_otc_content
Revises: 016_sale_structure
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op


revision = "017_sale_otc_content"
down_revision = "016_sale_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "token_sales",
        sa.Column("otc_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "token_sales",
        sa.Column("otc_content", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("token_sales", "otc_content")
    op.drop_column("token_sales", "otc_enabled")
