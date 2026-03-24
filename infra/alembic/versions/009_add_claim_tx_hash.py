"""Add claim_tx_hash column to contributions.

The Contribution model defines claim_tx_hash but no prior migration
created the column in the database.

Revision ID: 009_add_claim_tx_hash
Revises: 008_tx_hash_unique
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "009_add_claim_tx_hash"
down_revision = "008_tx_hash_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='contributions' AND column_name='claim_tx_hash'"
        )
    )
    if not result.fetchone():
        op.add_column(
            "contributions",
            sa.Column("claim_tx_hash", sa.String(66), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("contributions", "claim_tx_hash")
