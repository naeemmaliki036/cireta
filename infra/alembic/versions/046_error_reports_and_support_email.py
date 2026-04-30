"""Create error_reports table and seed platform_settings.support_email.

User-submitted error reports flow:
  1. UI catches a failed tx / API error
  2. User clicks 'Report' (optional free-text note)
  3. Backend writes a row here + sends an email to platform_settings.support_email

Revision ID: 046_error_reports_and_support_email
Revises: 045_token_sale_slug
Create Date: 2026-04-30
"""

import sqlalchemy as sa
from alembic import op

revision = "046_error_reports_and_support_email"
down_revision = "045_token_sale_slug"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_reports",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_email", sa.String(255), nullable=True),
        sa.Column("wallet_address", sa.String(42), nullable=True),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column("contract_address", sa.String(42), nullable=True),
        sa.Column("function_name", sa.String(100), nullable=True),
        sa.Column("chain_id", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("page_url", sa.String(500), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("additional_details", sa.Text(), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("email_status", sa.String(50), nullable=True),
    )
    op.create_index("ix_error_reports_user_id", "error_reports", ["user_id"])
    op.create_index("ix_error_reports_created_at", "error_reports", ["created_at"])
    op.create_index("ix_error_reports_function_name", "error_reports", ["function_name"])

    # Seed the support email — admin can override via /platform/settings.
    op.execute(
        """
        INSERT INTO platform_settings (id, key, value, created_at, updated_at)
        VALUES (gen_random_uuid(), 'support_email', 'naeem+support@vanarchain.com', NOW(), NOW())
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM platform_settings WHERE key = 'support_email'")
    op.drop_index("ix_error_reports_function_name", table_name="error_reports")
    op.drop_index("ix_error_reports_created_at", table_name="error_reports")
    op.drop_index("ix_error_reports_user_id", table_name="error_reports")
    op.drop_table("error_reports")
