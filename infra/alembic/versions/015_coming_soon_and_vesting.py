"""Coming soon flag, vesting config, widen status column.

Revision ID: 015_coming_soon_and_vesting
Revises: 014_issuer_otc_token
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op


revision = "015_coming_soon_and_vesting"
down_revision = "014_issuer_otc_token"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("token_sales", sa.Column("is_coming_soon", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("token_sales", sa.Column("cliff_duration_days", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("token_sales", sa.Column("vesting_duration_days", sa.Integer(), nullable=False, server_default="365"))
    op.alter_column("token_sales", "status", existing_type=sa.String(20), type_=sa.String(30))


def downgrade() -> None:
    op.alter_column("token_sales", "status", existing_type=sa.String(30), type_=sa.String(20))
    op.drop_column("token_sales", "vesting_duration_days")
    op.drop_column("token_sales", "cliff_duration_days")
    op.drop_column("token_sales", "is_coming_soon")
