"""Add fraction recovery support to recovery_logs + OTC operator addresses.

New columns on recovery_logs: token_type, fraction_id, amount, from_user_id, to_user_id.
Makes investor_user_id nullable (legacy column kept for existing rows).
New column on token_sales: otc_operator_addresses (JSONB).

Revision ID: 034_recovery_log_fraction_support
Revises: 033_identity_sync_job_wallet_address_snapshot
Create Date: 2026-04-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "034_recovery_log_fraction_support"
down_revision = "033_identity_sync_job_wallet_address_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recovery_log",
        sa.Column("token_type", sa.String(20), nullable=False, server_default="erc3643"),
    )
    op.add_column(
        "recovery_log",
        sa.Column("fraction_id", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "recovery_log",
        sa.Column("amount", sa.Numeric(), nullable=True),
    )
    op.add_column(
        "recovery_log",
        sa.Column(
            "from_user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "recovery_log",
        sa.Column(
            "to_user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    # Make investor_user_id nullable (legacy — old rows keep their value)
    op.alter_column("recovery_log", "investor_user_id", nullable=True)

    # OTC operator addresses on token_sales
    op.add_column(
        "token_sales",
        sa.Column("otc_operator_addresses", sa.dialects.postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("token_sales", "otc_operator_addresses")
    op.alter_column("recovery_log", "investor_user_id", nullable=False)
    op.drop_column("recovery_log", "to_user_id")
    op.drop_column("recovery_log", "from_user_id")
    op.drop_column("recovery_log", "amount")
    op.drop_column("recovery_log", "fraction_id")
    op.drop_column("recovery_log", "token_type")
