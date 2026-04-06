"""Add link_signature and link_nonce to wallets for audit trail.

Revision ID: 023_wallet_signature_audit
Revises: 022_investor_type_nullable
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "023_wallet_signature_audit"
down_revision = "022_investor_type_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wallets", sa.Column("link_signature", sa.Text(), nullable=True))
    op.add_column("wallets", sa.Column("link_nonce", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("wallets", "link_nonce")
    op.drop_column("wallets", "link_signature")
