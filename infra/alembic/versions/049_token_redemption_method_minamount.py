"""Add allowed-methods + minimum-amount config to token redemption settings.

Two new columns on `tokens`:
  - redemption_allowed_methods String(50) NOT NULL DEFAULT 'cash,physical'
    Comma-separated list of methods the issuer permits. Possible values:
    'cash', 'physical', or 'cash,physical' (both).
  - redemption_min_amount Numeric(78,18) nullable
    Minimum token amount per redemption request. NULL = no minimum.

Revision ID: 049_token_redemption_method_minamount
Revises: 048_token_redemption_attributes
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "049_token_redemption_method_minamount"
down_revision = "048_token_redemption_attributes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tokens",
        sa.Column(
            "redemption_allowed_methods",
            sa.String(50),
            nullable=False,
            server_default="cash,physical",
        ),
    )
    op.add_column(
        "tokens",
        sa.Column(
            "redemption_min_amount",
            sa.Numeric(precision=78, scale=18),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("tokens", "redemption_min_amount")
    op.drop_column("tokens", "redemption_allowed_methods")
