"""Add tracking_number to redemption_requests.

Revision ID: 037_redemption_tracking_number
Revises: 036_otc_transfer_log
Create Date: 2026-04-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "037_redemption_tracking_number"
down_revision = "036_otc_transfer_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "redemption_requests",
        sa.Column("tracking_number", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("redemption_requests", "tracking_number")
