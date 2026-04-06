"""Create wallet_audit_logs table for link/unlink audit trail.

Revision ID: 024_wallet_audit_log
Revises: 023_wallet_signature_audit
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_wallet_audit_log"
down_revision = "023_wallet_signature_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wallet_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("address_checksum", sa.String(42), nullable=False),
        sa.Column("chain_id", sa.Integer(), nullable=False, server_default="8453"),
        sa.Column("was_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("was_safe", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("was_registered_on_chain", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("link_signature", sa.Text(), nullable=True),
        sa.Column("link_nonce", sa.String(64), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unlinked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wallet_audit_logs_user_id", "wallet_audit_logs", ["user_id"])
    op.create_index("ix_wallet_audit_logs_action", "wallet_audit_logs", ["action"])
    op.create_index("ix_wallet_audit_logs_address_checksum", "wallet_audit_logs", ["address_checksum"])


def downgrade() -> None:
    op.drop_table("wallet_audit_logs")
