"""Create notification_preferences table.

Revision ID: 010_notification_preferences
Revises: 009_add_claim_tx_hash
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "010_notification_preferences"
down_revision = "009_add_claim_tx_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT 1 FROM information_schema.tables WHERE table_name='notification_preferences'")
    )
    if result.fetchone():
        return
    op.create_table(
        "notification_preferences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True),
        sa.Column("email_investment_updates", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("inapp_investment_updates", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("email_sale_announcements", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("inapp_sale_announcements", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("email_kyc_status", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("inapp_kyc_status", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("email_dividends", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("inapp_dividends", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("email_security", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("inapp_security", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("notification_preferences")
