"""Investor address book for physical redemption deliveries. PII fields
(recipient name, lines, city, region, postal code, phone, label, notes)
are stored encrypted at rest. ``country`` is plain alpha-3 so the
cross-country mismatch flag on redemption_requests can be a simple
column comparison.

Revision ID: 052_shipping_addresses
Revises: 051_wallet_register_tx_hash
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "052_shipping_addresses"
down_revision = "051_wallet_register_tx_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shipping_addresses",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Encrypted columns stored as VARBINARY/BYTEA — using Text for the
        # ciphertext payload is consistent with how EncryptedString writes
        # elsewhere in this schema (see users.sumsub_applicant_id, etc.).
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("recipient_name", sa.Text(), nullable=False),
        sa.Column("line1", sa.Text(), nullable=False),
        sa.Column("line2", sa.Text(), nullable=True),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("postal_code", sa.Text(), nullable=False),
        sa.Column("country", sa.String(length=3), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    # One default per user. Partial unique index — postgres only; sqlite
    # tests fall through to service-layer enforcement.
    op.create_index(
        "ix_shipping_addresses_user_default",
        "shipping_addresses",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shipping_addresses_user_default", table_name="shipping_addresses"
    )
    op.drop_table("shipping_addresses")
