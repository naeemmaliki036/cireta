"""Record the on-chain registration tx hash + timestamp on each wallet so
the admin UI can show "✓ registered · tx 0x123…" proof instead of just a
green shield. Both columns nullable — rows registered before this migration
have no hash, and indexer-driven flips may also leave it null.

Revision ID: 051_wallet_register_tx_hash
Revises: 050_redemption_requests_onchain_id
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "051_wallet_register_tx_hash"
down_revision = "050_redemption_requests_onchain_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wallets",
        sa.Column("register_tx_hash", sa.String(length=66), nullable=True),
    )
    op.add_column(
        "wallets",
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wallets", "registered_at")
    op.drop_column("wallets", "register_tx_hash")
