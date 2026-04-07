"""Add missing columns and tables that were in models but not migrated.

Revision ID: 026_missing_columns_and_tables
Revises: 025_wallet_address_unique
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "026_missing_columns_and_tables"
down_revision = "025_wallet_address_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # email_templates.is_active
    op.add_column("email_templates", sa.Column(
        "is_active", sa.Boolean(), nullable=False, server_default="true"
    ))

    # token_sales.is_visible
    op.add_column("token_sales", sa.Column(
        "is_visible", sa.Boolean(), nullable=False, server_default="false"
    ))

    # token_sales.otc_token_address
    op.add_column("token_sales", sa.Column(
        "otc_token_address", sa.String(42), nullable=True
    ))

    # sale_subscriptions table
    op.create_table(
        "sale_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sale_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["sale_id"], ["token_sales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sale_id", "email", name="uq_sale_subscription_email"),
    )

    # sale_phase_whitelists table
    op.create_table(
        "sale_phase_whitelists",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phase_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wallet_address", sa.String(42), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["phase_id"], ["sale_phases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("sale_phase_whitelists")
    op.drop_table("sale_subscriptions")
    op.drop_column("token_sales", "otc_token_address")
    op.drop_column("token_sales", "is_visible")
    op.drop_column("email_templates", "is_active")
