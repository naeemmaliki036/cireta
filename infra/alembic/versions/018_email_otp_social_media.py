"""Email templates, auth OTP, sale social links, and media type.

Revision ID: 018_email_otp_social_media
Revises: 017_sale_otc_content
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "018_email_otp_social_media"
down_revision = "017_sale_otc_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Email templates table
    op.create_table(
        "email_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(50), unique=True, index=True, nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Auth OTP table
    op.create_table(
        "auth_otps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Sale social links
    for col in ["website_url", "twitter_url", "linkedin_url", "instagram_url",
                "facebook_url", "telegram_url", "discord_url"]:
        op.add_column("token_sales", sa.Column(col, sa.String(500), nullable=True))

    # Sale media: add media_type and video_url to sale_images
    op.add_column("sale_images", sa.Column("media_type", sa.String(10), nullable=False, server_default="image"))
    op.add_column("sale_images", sa.Column("video_url", sa.String(500), nullable=True))

    # User: make hashed_password nullable (passwordless auth)
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)


def downgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=False)
    op.drop_column("sale_images", "video_url")
    op.drop_column("sale_images", "media_type")
    for col in ["discord_url", "telegram_url", "facebook_url", "instagram_url",
                "linkedin_url", "twitter_url", "website_url"]:
        op.drop_column("token_sales", col)
    op.drop_table("auth_otps")
    op.drop_table("email_templates")
