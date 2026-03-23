"""Add contract address fields to tokens + sprint 0.5 sale model fields.

Covers Sprint 0.2 (token contract addresses) and Sprint 0.5 (sale mode,
fee fields, vesting revocation, redemption details, user accreditation).

Revision ID: 004_contract_addresses_and_sale_fields
Revises: 003_spec_gap_fields
Create Date: 2026-03-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "004_contract_addresses_and_sale_fields"
down_revision = "003_spec_gap_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add Sprint 0.2 + 0.5 fields."""

    # ── tokens: deployed contract addresses (0.2) ──────────────────────
    op.add_column("tokens", sa.Column("identity_registry_address", sa.String(42), nullable=True))
    op.add_column("tokens", sa.Column("compliance_address", sa.String(42), nullable=True))
    op.add_column("tokens", sa.Column("sale_contract_address", sa.String(42), nullable=True))
    op.add_column("tokens", sa.Column("vault_address", sa.String(42), nullable=True))
    op.add_column("tokens", sa.Column("fraction_token_address", sa.String(42), nullable=True))

    # ── token_sales: total_withdrawn (0.5) ─────────────────────────────
    op.add_column(
        "token_sales",
        sa.Column(
            "total_withdrawn",
            sa.Numeric(precision=78, scale=18),
            server_default="0",
            nullable=False,
        ),
    )

    # ── token_sales: sale mode + fee fields (0.5) ──────────────────────
    op.add_column(
        "token_sales",
        sa.Column("platform_fee_bps", sa.Integer(), server_default="250", nullable=False),
    )
    op.add_column(
        "token_sales",
        sa.Column("sale_mode", sa.String(20), server_default="vested", nullable=False),
    )
    op.add_column("token_sales", sa.Column("vault_address", sa.String(42), nullable=True))
    op.add_column("token_sales", sa.Column("fraction_token_address", sa.String(42), nullable=True))

    # ── vesting_schedules: revocation fields (0.5) ─────────────────────
    op.add_column(
        "vesting_schedules",
        sa.Column("is_revocable", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "vesting_schedules",
        sa.Column("is_revoked", sa.Boolean(), server_default="false", nullable=False),
    )

    # ── redemption_requests: rejection + delivery (0.5) ────────────────
    op.add_column("redemption_requests", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("redemption_requests", sa.Column("delivery_details", sa.Text(), nullable=True))

    # ── users: accreditation (0.5) ─────────────────────────────────────
    op.add_column(
        "users", sa.Column("is_accredited", sa.Boolean(), server_default="false", nullable=False)
    )


def downgrade() -> None:
    """Remove Sprint 0.2 + 0.5 fields."""
    op.drop_column("users", "is_accredited")

    op.drop_column("redemption_requests", "delivery_details")
    op.drop_column("redemption_requests", "rejection_reason")

    op.drop_column("vesting_schedules", "is_revoked")
    op.drop_column("vesting_schedules", "is_revocable")

    op.drop_column("token_sales", "fraction_token_address")
    op.drop_column("token_sales", "vault_address")
    op.drop_column("token_sales", "sale_mode")
    op.drop_column("token_sales", "platform_fee_bps")
    op.drop_column("token_sales", "total_withdrawn")

    op.drop_column("tokens", "fraction_token_address")
    op.drop_column("tokens", "vault_address")
    op.drop_column("tokens", "sale_contract_address")
    op.drop_column("tokens", "compliance_address")
    op.drop_column("tokens", "identity_registry_address")
