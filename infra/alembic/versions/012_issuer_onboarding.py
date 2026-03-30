"""Issuer onboarding: whitelist table + new columns on issuers.

Revision ID: 012_issuer_onboarding
Revises: 011_platform_settings
Create Date: 2026-03-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "012_issuer_onboarding"
down_revision = "011_platform_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create issuer_whitelist table
    op.create_table(
        "issuer_whitelist",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("issuer_type", sa.String(20), nullable=False, server_default="individual"),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Add new columns to issuers table
    op.add_column("issuers", sa.Column("issuer_type", sa.String(20), nullable=False, server_default="individual"))
    op.add_column("issuers", sa.Column("wallet_status", sa.String(20), nullable=False, server_default="none"))
    op.add_column("issuers", sa.Column("identity_status", sa.String(20), nullable=False, server_default="none"))
    op.add_column("issuers", sa.Column("identity_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("issuers", sa.Column("sumsub_applicant_id", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("issuers", "sumsub_applicant_id")
    op.drop_column("issuers", "identity_verified_at")
    op.drop_column("issuers", "identity_status")
    op.drop_column("issuers", "wallet_status")
    op.drop_column("issuers", "issuer_type")
    op.drop_table("issuer_whitelist")
