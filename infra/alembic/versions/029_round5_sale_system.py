"""Round-5 sale system rewrite — schema deltas.

Adds new columns to token_sales, sale_phases, contributions for the round-5
contract rewrite (per-phase allocation mode, top-up minimum, USDC/OTC
contribution split, sale window, two-step activation, refund gate, etc.).

See docs/ROUND_5_SPEC.md for the design.

Revision ID: 029_round5_sale_system
Revises: 028_platform_stats_partners_team
Create Date: 2026-04-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "029_round5_sale_system"
down_revision = "028_platform_stats_partners_team"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── token_sales ──────────────────────────────────────────────────────────
    op.add_column(
        "token_sales",
        sa.Column(
            "total_token_supply",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "token_sales",
        sa.Column("sale_start_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column("sale_end_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column(
            "is_open_ended",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "token_sales",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column("refunds_activated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "token_sales",
        sa.Column(
            "finalization_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "token_sales",
        sa.Column("last_phase_added_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── sale_phases ──────────────────────────────────────────────────────────
    op.add_column(
        "sale_phases",
        sa.Column(
            "top_up_min",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            server_default="1000",
        ),
    )
    op.add_column(
        "sale_phases",
        sa.Column(
            "allocation_mode",
            sa.String(20),
            nullable=False,
            server_default="fixed",
        ),
    )

    # ── contributions ────────────────────────────────────────────────────────
    op.add_column(
        "contributions",
        sa.Column(
            "usdc_amount",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "contributions",
        sa.Column(
            "otc_amount",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            server_default="0",
        ),
    )

    # Backfill: existing rows where is_otc is True go to otc_amount, else usdc_amount.
    op.execute(
        """
        UPDATE contributions
        SET usdc_amount = CASE WHEN is_otc THEN 0 ELSE amount END,
            otc_amount  = CASE WHEN is_otc THEN amount ELSE 0 END
        """
    )


def downgrade() -> None:
    op.drop_column("contributions", "otc_amount")
    op.drop_column("contributions", "usdc_amount")
    op.drop_column("sale_phases", "allocation_mode")
    op.drop_column("sale_phases", "top_up_min")
    op.drop_column("token_sales", "last_phase_added_at")
    op.drop_column("token_sales", "finalization_pending")
    op.drop_column("token_sales", "refunds_activated_at")
    op.drop_column("token_sales", "activated_at")
    op.drop_column("token_sales", "approved_at")
    op.drop_column("token_sales", "is_open_ended")
    op.drop_column("token_sales", "sale_end_time")
    op.drop_column("token_sales", "sale_start_time")
    op.drop_column("token_sales", "total_token_supply")
