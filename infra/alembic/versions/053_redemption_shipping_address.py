"""Link redemption requests to a shipping address from the user's book, and
denormalise a ``shipping_country_mismatch`` flag so issuer dashboards can
filter on it without joining users. The free-text ``delivery_*`` columns
remain as the immutable snapshot of what the user submitted at request
time — editing the address book later must NOT rewrite past redemptions.

Revision ID: 053_redemption_shipping_address
Revises: 052_shipping_addresses
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "053_redemption_shipping_address"
down_revision = "052_shipping_addresses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "redemption_requests",
        sa.Column(
            "shipping_address_id",
            sa.UUID(),
            sa.ForeignKey("shipping_addresses.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "redemption_requests",
        sa.Column(
            "shipping_country_mismatch",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("redemption_requests", "shipping_country_mismatch")
    op.drop_column("redemption_requests", "shipping_address_id")
