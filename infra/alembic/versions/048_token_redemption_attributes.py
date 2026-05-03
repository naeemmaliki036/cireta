"""Add token-level redemption configuration attributes.

Adds three columns to the tokens table:
  - redemption_type  String(20) NOT NULL DEFAULT 'none'
    Describes the redemption mechanism: none | manual_off_chain | on_chain.
    Stored as a plain string so it is forward-compatible with new enum values
    without requiring a DDL migration. Mirrors RedemptionType enum values.
  - redemption_url   String(500) nullable
    URL investors visit to start a redemption (e.g. a form or portal link).
  - redemption_description  Text nullable
    Free-text description of the redemption process shown on the launchpad.

Note: redemption_manager_address (String 42, nullable) already exists from an
earlier migration and is not touched here.

Revision ID: 048_token_redemption_attributes
Revises: 047_users_dual_source_kyc
Create Date: 2026-05-03
"""

import sqlalchemy as sa
from alembic import op

revision = "048_token_redemption_attributes"
down_revision = "047_users_dual_source_kyc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tokens",
        sa.Column(
            "redemption_type",
            sa.String(20),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "tokens",
        sa.Column("redemption_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "tokens",
        sa.Column("redemption_description", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tokens", "redemption_description")
    op.drop_column("tokens", "redemption_url")
    op.drop_column("tokens", "redemption_type")
