"""Add acknowledged_at field to contributions for compliance acknowledgment.

Revision ID: 007_contribution_acknowledged_at
Revises: 006_sprint5_wallet_screening_mfa
Create Date: 2026-03-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "007_contribution_acknowledged_at"
down_revision = "006_sprint5_wallet_screening_mfa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contributions",
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("contributions", "acknowledged_at")
