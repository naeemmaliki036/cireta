"""Cireta initial schema with all models.

Revision ID: 002
Revises: 001
Create Date: 2026-03-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create all Cireta tables."""
    # Drop old scaffold tables if they exist
    op.execute("DROP TABLE IF EXISTS api_keys CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")

    # Users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, default="investor"),
        sa.Column("kyc_status", sa.String(20), nullable=False, default="none"),
        sa.Column("kyc_level", sa.Integer(), nullable=False, default=0),
        sa.Column("onchain_id", sa.String(42), nullable=True),
        sa.Column("sumsub_applicant_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # KYC Applications table
    op.create_table(
        "kyc_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("sumsub_review_id", sa.Text(), nullable=True),
        sa.Column("result_payload", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Wallets table
    op.create_table(
        "wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("address_checksum", sa.String(42), index=True, nullable=False),
        sa.Column("chain_id", sa.Integer(), nullable=False, default=8453),
        sa.Column("is_primary", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Issuers table
    op.create_table(
        "issuers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            index=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, index=True, nullable=False),
        sa.Column("wallet_address", sa.Text(), nullable=True),
        sa.Column("fee_bps", sa.Integer(), nullable=False, default=200),
        sa.Column("status", sa.String(20), nullable=False, default="pending"),
        sa.Column("legal_entity_name", sa.String(255), nullable=True),
        sa.Column("jurisdiction", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Tokens table
    op.create_table(
        "tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "issuer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("issuers.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("symbol", sa.String(20), index=True, nullable=False),
        sa.Column("asset_type", sa.String(20), nullable=False, default="commodity"),
        sa.Column("contract_address", sa.String(42), index=True, nullable=True),
        sa.Column("chain_id", sa.Integer(), nullable=False, default=8453),
        sa.Column("total_supply", sa.Numeric(precision=78, scale=18), nullable=False, default=0),
        sa.Column("decimals", sa.Integer(), nullable=False, default=18),
        sa.Column("ipfs_docs_hash", sa.String(100), nullable=True),
        sa.Column("chainlink_por_feed", sa.String(42), nullable=True),
        sa.Column("is_paused", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Token Sales table
    op.create_table(
        "token_sales",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "token_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tokens.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "issuer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("issuers.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "payment_token",
            sa.String(42),
            nullable=False,
            default="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ),
        sa.Column("soft_cap", sa.Numeric(precision=78, scale=18), nullable=False, default=0),
        sa.Column("hard_cap", sa.Numeric(precision=78, scale=18), nullable=False, default=0),
        sa.Column("status", sa.String(20), nullable=False, default="draft"),
        sa.Column("total_raised", sa.Numeric(precision=78, scale=18), nullable=False, default=0),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Sale Phases table
    op.create_table(
        "sale_phases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("token_sales.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("phase_number", sa.Integer(), nullable=False, default=1),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price_per_token", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column("allocation", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column(
            "min_contribution",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            default=0,
        ),
        sa.Column(
            "max_contribution",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            default=0,
        ),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("whitelist_only", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Contributions table
    op.create_table(
        "contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "sale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("token_sales.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "phase_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sale_phases.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column("tokens_allocated", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column("tx_hash", sa.String(66), unique=True, index=True, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, default="pending"),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Vesting Schedules table
    op.create_table(
        "vesting_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "token_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tokens.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("total_amount", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column(
            "claimed_amount",
            sa.Numeric(precision=78, scale=18),
            nullable=False,
            default=0,
        ),
        sa.Column("cliff_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vesting_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_claim_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Redemption Requests table
    op.create_table(
        "redemption_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "token_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tokens.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=78, scale=18), nullable=False),
        sa.Column("fulfillment_method", sa.String(20), nullable=False, default="cash"),
        sa.Column("status", sa.String(20), nullable=False, default="pending"),
        sa.Column("tx_hash", sa.String(66), index=True, nullable=True),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Audit Logs table (APPEND-ONLY - never update or delete)
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            index=True,
            nullable=True,
        ),
        sa.Column("action", sa.String(100), index=True, nullable=False),
        sa.Column("target_type", sa.String(50), index=True, nullable=False),
        sa.Column("target_id", sa.String(100), index=True, nullable=False),
        sa.Column("payload", postgresql.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Create indexes for common queries
    op.create_index(
        "ix_contributions_user_sale",
        "contributions",
        ["user_id", "sale_id"],
    )
    op.create_index(
        "ix_vesting_user_token",
        "vesting_schedules",
        ["user_id", "token_id"],
    )
    op.create_index(
        "ix_audit_logs_created_at",
        "audit_logs",
        ["created_at"],
    )


def downgrade() -> None:
    """Drop all Cireta tables."""
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_vesting_user_token", table_name="vesting_schedules")
    op.drop_index("ix_contributions_user_sale", table_name="contributions")

    op.drop_table("audit_logs")
    op.drop_table("redemption_requests")
    op.drop_table("vesting_schedules")
    op.drop_table("contributions")
    op.drop_table("sale_phases")
    op.drop_table("token_sales")
    op.drop_table("tokens")
    op.drop_table("issuers")
    op.drop_table("wallets")
    op.drop_table("kyc_applications")
    op.drop_table("users")
