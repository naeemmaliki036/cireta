"""Drop MFA columns from users table.

MFA was never usable end-to-end (no QR rendering, no login challenge UI on
either app). Removing it entirely as confirmed by Naeem 2026-04-27.

Revision ID: 039_drop_user_mfa_columns
Revises: 038_token_redemption_manager_address
Create Date: 2026-04-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "039_drop_user_mfa_columns"
down_revision = "038_token_redemption_manager_address"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "mfa_backup_codes")
    op.drop_column("users", "mfa_enabled")
    op.drop_column("users", "mfa_secret")


def downgrade() -> None:
    # Re-add as nullable so old data is recoverable; values are not
    # restored — anyone re-enabling MFA must go through setup again.
    op.add_column(
        "users",
        sa.Column("mfa_secret", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "mfa_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column("mfa_backup_codes", sa.String(), nullable=True),
    )
