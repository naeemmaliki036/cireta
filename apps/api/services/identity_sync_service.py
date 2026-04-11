"""Identity registry sync service.

Single entry point for enqueuing on-chain identity registrations and
revocations. Every trigger (Sumsub webhook, admin manual KYC approve,
wallet add, wallet remove) calls ``enqueue_identity_sync`` and nothing
else — the worker tasks (``task_sync_identity`` / ``task_sync_wallet``)
do the actual contract calls via ``SimpleIdentityBridgeService``.

Decisions locked in docs/IDENTITY_REGISTRY_SYNC_PLAN_2026-04-11.md:
- Simple identity-registry mode only for now (no IDENTITY_MODE branch).
- Dead-letter handling: after 3 attempts, ``IdentitySyncJob.status``
  flips to ``failed``, an audit_logs row is dropped, and the admin
  Compliance dashboard surfaces the row.
- Idempotent — the worker re-checks ``Wallet.registered_on_chain``
  before firing, so duplicate enqueues are safe.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import (
    IdentitySyncJobAction,
    IdentitySyncJobStatus,
)
from apps.api.models.identity_sync_job import IdentitySyncJob

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class IdentitySyncService:
    """Convergence point for every identity-registry sync trigger."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def enqueue(
        self,
        *,
        user_id: UUID,
        action: IdentitySyncJobAction,
        wallet_id: UUID | None = None,
    ) -> IdentitySyncJob:
        """Insert an IdentitySyncJob row and enqueue the matching arq task.

        Returns the persisted job (already committed) so callers can
        attach its ID to audit trails.

        Failure to enqueue on Redis is logged but does NOT raise — the
        DB row stays ``pending`` and the worker's pending-job sweep will
        pick it up on the next pass.
        """
        job = IdentitySyncJob()
        job.user_id = user_id
        job.wallet_id = wallet_id
        job.action = action
        job.status = IdentitySyncJobStatus.PENDING
        job.attempts = 0
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        try:
            from arq import create_pool
            from arq.connections import RedisSettings

            from packages.common.core.config import settings

            if not settings.redis_url:
                logger.warning(
                    "REDIS_URL not configured — identity sync job %s queued in DB only",
                    job.id,
                )
                return job

            pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
            if action == IdentitySyncJobAction.PROVISION:
                await pool.enqueue_job("task_sync_identity", str(job.id))
            else:
                await pool.enqueue_job("task_sync_wallet", str(job.id))
            logger.info(
                "Identity sync enqueued: job=%s user=%s action=%s wallet=%s",
                job.id, user_id, action, wallet_id,
            )
        except Exception as exc:
            # Don't raise — the pending row will be retried by the
            # worker's sweep loop. We just log so we have a breadcrumb.
            logger.warning(
                "Failed to enqueue identity sync job %s on Redis: %s "
                "(row stays pending and will be retried by worker sweep)",
                job.id, exc,
            )

        return job


async def enqueue_identity_sync(
    db: AsyncSession,
    *,
    user_id: UUID,
    action: IdentitySyncJobAction,
    wallet_id: UUID | None = None,
) -> IdentitySyncJob:
    """Module-level convenience wrapper.

    Use this from services where instantiating the class is more noise
    than signal (e.g. inside a one-off effect inside another service).
    """
    return await IdentitySyncService(db).enqueue(
        user_id=user_id, action=action, wallet_id=wallet_id
    )
