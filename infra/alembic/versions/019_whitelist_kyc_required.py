"""Add kyc_required flag to issuer_whitelist.

Revision ID: 019_whitelist_kyc_required
Revises: 018_email_otp_social_media
Create Date: 2026-03-31
"""

import sqlalchemy as sa
from alembic import op

revision = "019_whitelist_kyc_required"
down_revision = "018_email_otp_social_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "issuer_whitelist",
        sa.Column("kyc_required", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("issuer_whitelist", "kyc_required")
