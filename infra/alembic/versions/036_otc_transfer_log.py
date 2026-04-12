"""Create otc_transfer_logs table.

Revision ID: 036_otc_transfer_log
Revises: 035_sale_phase_tentative
Create Date: 2026-04-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "036_otc_transfer_log"
down_revision = "035_sale_phase_tentative"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "otc_transfer_logs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("token_sales.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("operator_address", sa.String(42), nullable=False, index=True),
        sa.Column("buyer_address", sa.String(42), nullable=False, index=True),
        sa.Column("fraction_id", sa.SmallInteger(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column("tx_hash", sa.String(66), nullable=False, unique=True, index=True),
        sa.Column("block_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("otc_transfer_logs")
