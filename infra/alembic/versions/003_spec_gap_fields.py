"""Add spec-required fields missing from initial schema.

Revision ID: 003_spec_gap_fields
Revises: 002_cireta_initial_schema
Create Date: 2026-03-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003_spec_gap_fields"
down_revision = "9cd097779a53"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add missing spec fields and tables."""

    # ── users: missing spec fields ─────────────────────────────────────────
    op.add_column("users", sa.Column("display_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("country_code", sa.String(2), nullable=True))
    op.add_column("users", sa.Column("investor_type", sa.String(20), server_default="individual", nullable=False))
    op.add_column("users", sa.Column("kyc_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("kyc_external_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("kyc_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("kyc_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_reset_token", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("password_reset_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))

    # ── wallets: missing spec fields ───────────────────────────────────────
    op.add_column("wallets", sa.Column("is_safe", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("wallets", sa.Column("registered_on_chain", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("wallets", sa.Column("label", sa.String(100), nullable=True))
    op.add_column("wallets", sa.Column("linked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

    # ── token_sales: missing spec fields ──────────────────────────────────
    op.add_column("token_sales", sa.Column("fee_cap_usdc", sa.Numeric(36, 6), nullable=True))
    op.add_column("token_sales", sa.Column("total_raised_on_platform", sa.Numeric(36, 6), server_default="0", nullable=False))
    op.add_column("token_sales", sa.Column("platform_fee_collected", sa.Numeric(36, 6), server_default="0", nullable=False))
    op.add_column("token_sales", sa.Column("contract_address", sa.String(42), nullable=True))
    op.add_column("token_sales", sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True))

    # ── contributions: OTC fields ──────────────────────────────────────────
    op.add_column("contributions", sa.Column("is_otc", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("contributions", sa.Column("otc_reference", sa.String(255), nullable=True))
    op.add_column("contributions", sa.Column("wallet_address", sa.String(42), nullable=True))
    op.add_column("contributions", sa.Column("phase_index", sa.Integer(), server_default="0", nullable=False))

    # ── redemption_requests: delivery fields ──────────────────────────────
    op.add_column("redemption_requests", sa.Column("delivery_name", sa.String(255), nullable=True))
    op.add_column("redemption_requests", sa.Column("delivery_address", sa.Text(), nullable=True))
    op.add_column("redemption_requests", sa.Column("delivery_phone", sa.String(50), nullable=True))
    op.add_column("redemption_requests", sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True))

    # ── issuers: whitelist tracking ────────────────────────────────────────
    op.add_column("issuers", sa.Column("whitelisted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("issuers", sa.Column("whitelisted_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_issuers_whitelisted_by", "issuers", "users", ["whitelisted_by"], ["id"], ondelete="SET NULL")

    # ── notifications table (new) ──────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("data", postgresql.JSON(), nullable=True),
        sa.Column("read", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("emailed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "read"])

    # ── recovery_log table (new) ───────────────────────────────────────────
    op.create_table(
        "recovery_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tokens.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("issuer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issuers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("investor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lost_wallet", sa.String(42), nullable=False),
        sa.Column("new_wallet", sa.String(42), nullable=False),
        sa.Column("onchain_id", sa.String(42), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── token_documents table (new) ────────────────────────────────────────
    op.create_table(
        "token_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tokens.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("doc_type", sa.String(50), nullable=False),
        sa.Column("ipfs_hash", sa.String(64), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── dividend_distributions table (new) ─────────────────────────────────
    op.create_table(
        "dividend_distributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("token_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tokens.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("epoch_index", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(36, 6), nullable=False),
        sa.Column("total_supply_snapshot", sa.Numeric(36, 18), nullable=False),
        sa.Column("contract_address", sa.String(42), nullable=True),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Remove spec gap fields."""
    op.drop_table("dividend_distributions")
    op.drop_table("token_documents")
    op.drop_table("recovery_log")
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_table("notifications")

    op.drop_constraint("fk_issuers_whitelisted_by", "issuers", type_="foreignkey")
    op.drop_column("issuers", "whitelisted_by")
    op.drop_column("issuers", "whitelisted_at")

    for col in ["shipped_at", "delivery_phone", "delivery_address", "delivery_name"]:
        op.drop_column("redemption_requests", col)

    for col in ["phase_index", "wallet_address", "otc_reference", "is_otc"]:
        op.drop_column("contributions", col)

    for col in ["finalized_at", "contract_address", "platform_fee_collected", "total_raised_on_platform", "fee_cap_usdc"]:
        op.drop_column("token_sales", col)

    for col in ["linked_at", "label", "registered_on_chain", "is_safe"]:
        op.drop_column("wallets", col)

    for col in ["locked_until", "failed_login_attempts", "password_reset_expires", "password_reset_token",
                "kyc_expires_at", "kyc_verified_at", "kyc_external_id", "kyc_provider",
                "investor_type", "country_code", "email_verified_at", "email_verified", "display_name"]:
        op.drop_column("users", col)
