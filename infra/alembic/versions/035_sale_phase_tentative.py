"""Add off-chain tentative phase support to sale_phases.

New columns: deployed_on_chain (bool, default false), on_chain_phase_id (int, nullable).
Existing rows are set to deployed_on_chain=true (backward compat).

Revision ID: 035_sale_phase_tentative
Revises: 034_recovery_log_fraction_support
Create Date: 2026-04-12
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "035_sale_phase_tentative"
down_revision = "034_recovery_log_fraction_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sale_phases",
        sa.Column("deployed_on_chain", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "sale_phases",
        sa.Column("on_chain_phase_id", sa.Integer(), nullable=True),
    )
    # Existing phases are already deployed
    op.execute("UPDATE sale_phases SET deployed_on_chain = true")


def downgrade() -> None:
    op.drop_column("sale_phases", "on_chain_phase_id")
    op.drop_column("sale_phases", "deployed_on_chain")
