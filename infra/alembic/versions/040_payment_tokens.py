"""Create payment_tokens table and seed Base Sepolia stablecoins.

Replaces the hardcoded PAYMENT_TOKENS array in apps/admin/src/app/issuer/sales/new/page.tsx
so admins can add accepted payment tokens (USDT, DAI, etc.) without a code change.

Seeds two Base Sepolia (chain 84532) entries:
  - cUSDC — Cireta USDC Mock at 0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898
  - USDC  — Circle (Base Sepolia) at 0x036CbD53842c5426634e7929541eC2318f3dCF7e

Revision ID: 040_payment_tokens
Revises: 039_drop_user_mfa_columns
Create Date: 2026-04-29
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "040_payment_tokens"
down_revision = "039_drop_user_mfa_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("address", sa.String(length=42), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("chain_id", sa.Integer(), nullable=False),
        sa.Column("decimals", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            onupdate=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("address"),
    )
    op.create_index(
        "ix_payment_tokens_address",
        "payment_tokens",
        ["address"],
        unique=True,
    )

    # Seed Base Sepolia stablecoins
    payment_tokens = sa.table(
        "payment_tokens",
        sa.column("id", sa.UUID()),
        sa.column("address", sa.String()),
        sa.column("symbol", sa.String()),
        sa.column("name", sa.String()),
        sa.column("chain_id", sa.Integer()),
        sa.column("decimals", sa.Integer()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        payment_tokens,
        [
            {
                "id": uuid.uuid4(),
                "address": "0x3Bfb6B62C015EE815e5Eb0A7e212F580446D9898",
                "symbol": "cUSDC",
                "name": "Cireta USDC Mock (testnet faucet)",
                "chain_id": 84532,
                "decimals": 6,
                "sort_order": 0,
                "is_active": True,
            },
            {
                "id": uuid.uuid4(),
                "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                "symbol": "USDC",
                "name": "Circle (Base Sepolia)",
                "chain_id": 84532,
                "decimals": 6,
                "sort_order": 1,
                "is_active": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_payment_tokens_address", table_name="payment_tokens")
    op.drop_table("payment_tokens")
