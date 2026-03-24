"""Sprint 5 — wallet screening fields + MFA fields on users.

Revision ID: 006_sprint5_wallet_screening_mfa
Revises: 005_webhook_events_table
Create Date: 2026-03-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "006_sprint5_wallet_screening_mfa"
down_revision = "005_webhook_events_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Wallet screening fields
    op.add_column("wallets", sa.Column("risk_score", sa.Float(), nullable=True))
    op.add_column(
        "wallets",
        sa.Column("last_screened_at", sa.DateTime(timezone=True), nullable=True),
    )

    # MFA fields on users
    op.add_column("users", sa.Column("mfa_secret", sa.Text(), nullable=True))
    op.add_column(
        "users", sa.Column("mfa_enabled", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column("users", sa.Column("mfa_backup_codes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "mfa_backup_codes")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "mfa_secret")
    op.drop_column("wallets", "last_screened_at")
    op.drop_column("wallets", "risk_score")
