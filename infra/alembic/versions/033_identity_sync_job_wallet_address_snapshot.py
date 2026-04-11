"""Add wallet_address_snapshot to identity_sync_jobs.

Lets task_sync_wallet call SimpleIdentityRegistry.removeFromWhitelist
using a snapshotted address when the Wallet row has already been
deleted by the time the worker picks up the job. Previously the worker
would log "wallet no longer in DB, skipping" and leave a ghost
whitelist entry on chain.

Nullable + additive — no backfill needed. New rows carry the snapshot
when the enqueue site has it; rows created before this migration stay
NULL and the worker falls back to loading by wallet_id.

Revision ID: 033_identity_sync_job_wallet_address_snapshot
Revises: 032_identity_sync_jobs_and_wallet_deletion_requests
Create Date: 2026-04-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "033_identity_sync_job_wallet_address_snapshot"
down_revision = "032_identity_sync_jobs_and_wallet_deletion_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "identity_sync_jobs",
        sa.Column("wallet_address_snapshot", sa.String(42), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("identity_sync_jobs", "wallet_address_snapshot")
