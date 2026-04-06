"""Add unique constraint on wallets.address_checksum.

Revision ID: 025_wallet_address_unique
Revises: 024_wallet_audit_log
Create Date: 2026-04-07
"""

from alembic import op

revision = "025_wallet_address_unique"
down_revision = "024_wallet_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_wallets_address_checksum", table_name="wallets")
    op.create_index("ix_wallets_address_checksum", "wallets", ["address_checksum"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_wallets_address_checksum", table_name="wallets")
    op.create_index("ix_wallets_address_checksum", "wallets", ["address_checksum"], unique=False)
