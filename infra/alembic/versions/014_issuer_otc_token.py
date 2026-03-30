"""Add otc_token_address column to issuers table.

Revision ID: 014_issuer_otc_token
Revises: 013_sale_content_and_approval
Create Date: 2026-03-29
"""

import sqlalchemy as sa
from alembic import op


revision = "014_issuer_otc_token"
down_revision = "013_sale_content_and_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "issuers",
        sa.Column("otc_token_address", sa.String(42), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("issuers", "otc_token_address")
