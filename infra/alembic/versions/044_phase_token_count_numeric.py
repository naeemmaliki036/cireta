"""Widen sale_phases.{min_tokens,max_tokens,top_up_min_tokens} from int4 to numeric(78,0).

These columns mirror Sale.sol's uint256 phase parameters (minTokens,
maxTokens, topUpMinTokens). Storing 6-decimal-scaled token amounts in a
postgres int4 overflows for any allocation cap >= ~2.14e9 — which means
a 6-dec token's max_tokens of 100,000 (= 100_000 * 1e6 = 1e11) already
breaks. Backfill scripts inserting on-chain phases hit "integer out of
range" because of this.

Switch to numeric(78,0) to match the uint256 semantics already used for
price_per_token / allocation / min_contribution / max_contribution.

Revision ID: 044_phase_token_count_numeric
Revises: 043_vesting_seconds_int
Create Date: 2026-04-30
"""

import sqlalchemy as sa
from alembic import op

revision = "044_phase_token_count_numeric"
down_revision = "043_vesting_seconds_int"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "sale_phases",
        "min_tokens",
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=78, scale=0),
        existing_nullable=False,
        existing_server_default="1",
        postgresql_using="min_tokens::numeric",
    )
    op.alter_column(
        "sale_phases",
        "max_tokens",
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=78, scale=0),
        existing_nullable=False,
        existing_server_default="0",
        postgresql_using="max_tokens::numeric",
    )
    op.alter_column(
        "sale_phases",
        "top_up_min_tokens",
        existing_type=sa.Integer(),
        type_=sa.Numeric(precision=78, scale=0),
        existing_nullable=False,
        existing_server_default="1",
        postgresql_using="top_up_min_tokens::numeric",
    )


def downgrade() -> None:
    # Values that fit in int4 will downgrade cleanly. Values larger than
    # 2_147_483_647 will be rejected by the cast — that's intentional, the
    # whole reason we widened.
    op.alter_column(
        "sale_phases",
        "min_tokens",
        existing_type=sa.Numeric(precision=78, scale=0),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default="1",
        postgresql_using="min_tokens::integer",
    )
    op.alter_column(
        "sale_phases",
        "max_tokens",
        existing_type=sa.Numeric(precision=78, scale=0),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default="0",
        postgresql_using="max_tokens::integer",
    )
    op.alter_column(
        "sale_phases",
        "top_up_min_tokens",
        existing_type=sa.Numeric(precision=78, scale=0),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default="1",
        postgresql_using="top_up_min_tokens::integer",
    )
