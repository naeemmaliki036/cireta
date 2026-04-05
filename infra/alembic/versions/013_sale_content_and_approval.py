"""Sale content fields, approval flow, and related tables.

Revision ID: 013_sale_content_and_approval
Revises: 012_issuer_onboarding
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = "013_sale_content_and_approval"
down_revision = "012_issuer_onboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- TokenSale: add content fields, make token_id nullable ---
    op.alter_column("token_sales", "token_id", existing_type=UUID(as_uuid=True), nullable=True)
    op.add_column("token_sales", sa.Column("title", sa.String(255), nullable=True))
    op.add_column("token_sales", sa.Column("description", sa.String(2000), nullable=True))
    op.add_column("token_sales", sa.Column("full_description", sa.Text(), nullable=True))
    op.add_column("token_sales", sa.Column("banner_image_url", sa.String(500), nullable=True))

    # --- SaleTeamMember ---
    op.create_table(
        "sale_team_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("token_sales.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- SaleFAQ ---
    op.create_table(
        "sale_faqs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("token_sales.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- SaleImage ---
    op.create_table(
        "sale_images",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("token_sales.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("caption", sa.String(500), nullable=True),
        sa.Column("is_banner", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- SaleDocument ---
    op.create_table(
        "sale_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sale_id", UUID(as_uuid=True), sa.ForeignKey("token_sales.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("doc_type", sa.String(50), nullable=False, server_default="other"),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("ipfs_hash", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("sale_documents")
    op.drop_table("sale_images")
    op.drop_table("sale_faqs")
    op.drop_table("sale_team_members")
    op.drop_column("token_sales", "banner_image_url")
    op.drop_column("token_sales", "full_description")
    op.drop_column("token_sales", "description")
    op.drop_column("token_sales", "title")
    op.alter_column("token_sales", "token_id", existing_type=UUID(as_uuid=True), nullable=False)
