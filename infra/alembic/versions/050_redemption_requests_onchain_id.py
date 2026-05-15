"""Add onchain_id to redemption_requests so the indexer can join on-chain
RedemptionRequested(id, ...) events back to DB rows. Without this column
the listener's match query failed silently and never found existing rows.

Revision ID: 050_redemption_requests_onchain_id
Revises: 049_token_redemption_method_minamount
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "050_redemption_requests_onchain_id"
down_revision = "049_token_redemption_method_minamount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "redemption_requests",
        sa.Column("onchain_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_redemption_requests_onchain_id",
        "redemption_requests",
        ["token_id", "onchain_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_redemption_requests_onchain_id", table_name="redemption_requests"
    )
    op.drop_column("redemption_requests", "onchain_id")
