"""Convert cliff/vesting columns from Numeric(days) to Integer(seconds).

Matches on-chain unit (Sale.initialize / addPhase take uint256 seconds) and
removes float-precision drama for sub-day testing values (5 min = 300,
1 hour = 3600, 1 day = 86400).

Revision ID: 043_vesting_seconds_int
Revises: 042_vesting_duration_numeric
Create Date: 2026-04-30
"""

import sqlalchemy as sa
from alembic import op

revision = "043_vesting_seconds_int"
down_revision = "042_vesting_duration_numeric"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the new seconds columns with safe defaults so existing rows can be
    # backfilled before we drop the old _days columns.
    op.add_column(
        "token_sales",
        sa.Column(
            "cliff_duration_seconds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "token_sales",
        sa.Column(
            "vesting_duration_seconds",
            sa.Integer(),
            nullable=False,
            server_default=str(365 * 86400),
        ),
    )

    # Backfill: seconds = ROUND(days * 86400). Using ROUND to absorb any tiny
    # float drift from prior Numeric values like 0.003472.
    op.execute(
        "UPDATE token_sales SET "
        "cliff_duration_seconds = COALESCE(ROUND(cliff_duration_days * 86400), 0), "
        "vesting_duration_seconds = COALESCE(ROUND(vesting_duration_days * 86400), 0)"
    )

    op.drop_column("token_sales", "cliff_duration_days")
    op.drop_column("token_sales", "vesting_duration_days")


def downgrade() -> None:
    # Recreate the old days columns and reverse the backfill (seconds / 86400).
    # Numeric(12, 6) preserves sub-day precision on round-trip.
    op.add_column(
        "token_sales",
        sa.Column(
            "cliff_duration_days",
            sa.Numeric(precision=12, scale=6),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "token_sales",
        sa.Column(
            "vesting_duration_days",
            sa.Numeric(precision=12, scale=6),
            nullable=False,
            server_default="365",
        ),
    )
    op.execute(
        "UPDATE token_sales SET "
        "cliff_duration_days = cliff_duration_seconds::numeric / 86400, "
        "vesting_duration_days = vesting_duration_seconds::numeric / 86400"
    )
    op.drop_column("token_sales", "cliff_duration_seconds")
    op.drop_column("token_sales", "vesting_duration_seconds")
