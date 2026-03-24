"""Add unique constraint on contributions.tx_hash.

The SQLAlchemy model already declares unique=True on tx_hash, but the
earlier migrations created the column without a database-level UNIQUE
constraint.  This migration adds it explicitly so the DB enforces
idempotent contribution recording.

Revision ID: 008_tx_hash_unique
Revises: 007_contribution_acknowledged_at
Create Date: 2026-03-24
"""

from alembic import op

# revision identifiers
revision = "008_tx_hash_unique"
down_revision = "007_contribution_acknowledged_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_contributions_tx_hash",
        "contributions",
        ["tx_hash"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_contributions_tx_hash", "contributions", type_="unique")
