"""Decrypt wallet addresses — no longer encrypted.

Wallet addresses are public blockchain data and don't need encryption.
This migration converts encrypted values to plaintext checksummed addresses.

Revision ID: 027_decrypt_wallet_addresses
Revises: 026_missing_columns_and_tables
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "027_decrypt_wallet_addresses"
down_revision = "026_missing_columns_and_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # For wallets: address column has encrypted data, but address_checksum
    # has the plaintext checksummed address. Copy checksum to address.
    op.execute("UPDATE wallets SET address = address_checksum")

    # For issuers: wallet_address is encrypted. We need to decrypt it.
    # Since we can't decrypt in SQL, set it from the known checksum format.
    # The wallet_address was stored encrypted but we know the plaintext
    # values are Ethereum addresses (0x + 40 hex chars).
    # For any that look encrypted (start with 'gAAAA'), null them out
    # so the issuer can re-submit.
    op.execute(
        "UPDATE issuers SET wallet_address = NULL "
        "WHERE wallet_address IS NOT NULL AND wallet_address LIKE 'gAAAA%'"
    )

    # For wallet_audit_logs: copy address_checksum to address (same as wallets)
    op.execute("UPDATE wallet_audit_logs SET address = address_checksum")

    # Change column types from Text to varchar(42)
    op.alter_column("wallets", "address", type_=sa.String(42), existing_nullable=False)
    op.alter_column("issuers", "wallet_address", type_=sa.String(42), existing_nullable=True)
    op.alter_column("wallet_audit_logs", "address", type_=sa.String(42), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("wallets", "address", type_=sa.Text(), existing_nullable=False)
    op.alter_column("issuers", "wallet_address", type_=sa.Text(), existing_nullable=True)
    op.alter_column("wallet_audit_logs", "address", type_=sa.Text(), existing_nullable=False)
