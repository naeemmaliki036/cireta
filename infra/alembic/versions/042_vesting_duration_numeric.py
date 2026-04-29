"""Switch vesting duration columns from Integer to Numeric.

Allows fractional-day values (e.g. 0.00347 = 5 min, 0.04167 = 1 hour) for
testing scenarios. The contract already accepts seconds, so the conversion
in the deploy flow (days * 86400) just needs to handle floats.

Revision ID: 042_vesting_duration_numeric
Revises: 041_token_supply_fields
Create Date: 2026-04-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "042_vesting_duration_numeric"
down_revision = "041_token_supply_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "token_sales",
        "cliff_duration_days",
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
    )
    op.alter_column(
        "token_sales",
        "vesting_duration_days",
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=12, scale=6),
        existing_nullable=False,
        existing_server_default=sa.text("365"),
    )


def downgrade() -> None:
    op.alter_column(
        "token_sales",
        "vesting_duration_days",
        existing_type=sa.Numeric(precision=12, scale=6),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default=sa.text("365"),
        postgresql_using="vesting_duration_days::integer",
    )
    op.alter_column(
        "token_sales",
        "cliff_duration_days",
        existing_type=sa.Numeric(precision=12, scale=6),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
        postgresql_using="cliff_duration_days::integer",
    )
