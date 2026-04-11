"""Add identity_sync_jobs + wallet_deletion_requests tables.

Phase 1 of the identity-registry sync feature. Adds two empty tables:

- ``identity_sync_jobs`` — queue + audit log for arq tasks that ask the
  registrar wallet to register/revoke buyer wallets on the on-chain
  identity registry. Powers the dead-letter dashboard.
- ``wallet_deletion_requests`` — buyer-initiated requests to remove a
  wallet from a KYC-verified profile. Verified users cannot self-delete;
  an admin reviews + approves/denies. Wallets that have ever participated
  in a sale are blocked at the API layer and never reach this table.

No backfill — both tables start empty. No behavior change yet; subsequent
phases (worker tasks, endpoint gating, admin UI) consume these tables.

Revision ID: 032_identity_sync_jobs_and_wallet_deletion_requests
Revises: 031_whole_token_buy
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "032_identity_sync_jobs_and_wallet_deletion_requests"
down_revision = "031_whole_token_buy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── identity_sync_jobs ──────────────────────────────────────────
    op.create_table(
        "identity_sync_jobs",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "wallet_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("wallets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "attempts", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column(
            "enqueued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index(
        "ix_identity_sync_jobs_user_id",
        "identity_sync_jobs",
        ["user_id"],
    )
    op.create_index(
        "ix_identity_sync_jobs_wallet_id",
        "identity_sync_jobs",
        ["wallet_id"],
    )
    op.create_index(
        "ix_identity_sync_jobs_status",
        "identity_sync_jobs",
        ["status"],
    )
    op.create_index(
        "ix_identity_sync_jobs_action",
        "identity_sync_jobs",
        ["action"],
    )

    # ── wallet_deletion_requests ────────────────────────────────────
    op.create_table(
        "wallet_deletion_requests",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "wallet_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("wallet_address_snapshot", sa.String(42), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "reviewed_by",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
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
    op.create_index(
        "ix_wallet_deletion_requests_user_id",
        "wallet_deletion_requests",
        ["user_id"],
    )
    op.create_index(
        "ix_wallet_deletion_requests_wallet_id",
        "wallet_deletion_requests",
        ["wallet_id"],
    )
    op.create_index(
        "ix_wallet_deletion_requests_status",
        "wallet_deletion_requests",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wallet_deletion_requests_status",
        table_name="wallet_deletion_requests",
    )
    op.drop_index(
        "ix_wallet_deletion_requests_wallet_id",
        table_name="wallet_deletion_requests",
    )
    op.drop_index(
        "ix_wallet_deletion_requests_user_id",
        table_name="wallet_deletion_requests",
    )
    op.drop_table("wallet_deletion_requests")

    op.drop_index(
        "ix_identity_sync_jobs_action", table_name="identity_sync_jobs"
    )
    op.drop_index(
        "ix_identity_sync_jobs_status", table_name="identity_sync_jobs"
    )
    op.drop_index(
        "ix_identity_sync_jobs_wallet_id", table_name="identity_sync_jobs"
    )
    op.drop_index(
        "ix_identity_sync_jobs_user_id", table_name="identity_sync_jobs"
    )
    op.drop_table("identity_sync_jobs")
