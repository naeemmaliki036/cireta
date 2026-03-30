"""Add is_super_admin flag to users.

Revision ID: 020_super_admin
Revises: 019_whitelist_kyc_required
Create Date: 2026-03-31
"""

import sqlalchemy as sa
from alembic import op

revision = "020_super_admin"
down_revision = "019_whitelist_kyc_required"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default="false"))
    # Mark the first admin as super admin
    op.execute("UPDATE users SET is_super_admin = true WHERE role = 'admin' AND id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)")


def downgrade() -> None:
    op.drop_column("users", "is_super_admin")
