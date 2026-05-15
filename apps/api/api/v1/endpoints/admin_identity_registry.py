"""Admin identity-registry sync endpoints + emergency manual flow.

Two surfaces:

1. **Worker-driven sync (default).** The admin doesn't normally interact
   with these — the queued ``task_sync_identity`` / ``task_sync_wallet``
   tasks handle everything. The endpoints below let the admin re-enqueue
   a stuck job (`POST /retry/{job_id}`) and inspect the dead-letter
   queue (`GET /sync-jobs?status=failed`).

2. **Emergency manual flow.** When the worker is down or the registrar
   wallet is unavailable, the admin can call the contract directly from
   the admin UI using their own connected wallet (via wagmi). The
   admin's wallet must have been granted ``REGISTRAR_ROLE`` on the
   ``SimpleIdentityRegistry`` contract — see
   ``docs/IDENTITY_REGISTRY_SYNC_PLAN_2026-04-11.md`` Infra section.

   The frontend signs the tx; this backend endpoint just records the
   outcome:
     - Flips ``Wallet.registered_on_chain`` for any matching wallet row.
     - Writes an ``audit_logs`` row tagged
       ``identity_registry_emergency_<add|remove>`` so we have a clean
       compliance trail.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
from apps.api.models.enums import IdentitySyncJobAction, IdentitySyncJobStatus
from apps.api.models.identity_sync_job import IdentitySyncJob
from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/identity-registry", tags=["admin-identity-registry"])


class IdentitySyncJobResponse(BaseModel):
    id: str
    user_id: str
    user_email: str | None
    wallet_id: str | None
    action: str
    status: str
    attempts: int
    last_error: str | None
    tx_hash: str | None
    enqueued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class IdentitySyncJobListResponse(BaseModel):
    jobs: list[IdentitySyncJobResponse]
    total: int


class EmergencyManualRegisterBody(BaseModel):
    """Body for the emergency manual register endpoint.

    The admin signs the addToWhitelist / removeFromWhitelist tx with
    their own wallet via wagmi; this endpoint just records the outcome.
    """

    wallet_address: str = Field(..., min_length=42, max_length=42)
    action: Literal["add", "remove"]
    tx_hash: str = Field(..., min_length=66, max_length=66)


@router.get("/sync-jobs", response_model=IdentitySyncJobListResponse)
async def list_identity_sync_jobs(
    admin_id: RequireAdmin,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[
        Literal["pending", "running", "succeeded", "failed", "all"],
        Query(alias="status"),
    ] = "failed",
) -> IdentitySyncJobListResponse:
    """List identity sync jobs, default to the dead-letter queue."""
    q = select(IdentitySyncJob, User.email).join(
        User, IdentitySyncJob.user_id == User.id
    )
    if status_filter != "all":
        q = q.where(IdentitySyncJob.status == status_filter)
    q = q.order_by(IdentitySyncJob.enqueued_at.desc()).limit(200)
    rows = (await db.execute(q)).all()

    return IdentitySyncJobListResponse(
        jobs=[
            IdentitySyncJobResponse(
                id=str(j.id),
                user_id=str(j.user_id),
                user_email=email,
                wallet_id=str(j.wallet_id) if j.wallet_id else None,
                action=j.action if isinstance(j.action, str) else j.action.value,
                status=j.status if isinstance(j.status, str) else j.status.value,
                attempts=j.attempts,
                last_error=j.last_error,
                tx_hash=j.tx_hash,
                enqueued_at=j.enqueued_at,
                started_at=j.started_at,
                completed_at=j.completed_at,
            )
            for j, email in rows
        ],
        total=len(rows),
    )


@router.post("/sync-jobs/{job_id}/retry", response_model=IdentitySyncJobResponse)
async def retry_identity_sync_job(
    job_id: UUID,
    admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IdentitySyncJobResponse:
    """Reset a failed sync job to pending and re-enqueue it on Redis."""
    job_q = await db.execute(select(IdentitySyncJob).where(IdentitySyncJob.id == job_id))
    job = job_q.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")

    job.status = IdentitySyncJobStatus.PENDING
    job.attempts = 0
    job.last_error = None
    job.started_at = None
    job.completed_at = None
    await db.commit()
    await db.refresh(job)

    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        from packages.common.core.config import settings

        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        if job.action == IdentitySyncJobAction.PROVISION:
            await pool.enqueue_job("task_sync_identity", str(job.id))
        else:
            await pool.enqueue_job("task_sync_wallet", str(job.id))
    except Exception as exc:
        logger.warning("retry: redis enqueue failed for job %s: %s", job_id, exc)
        # Job stays pending — sweep loop will pick it up.

    audit = AuditLog()
    audit.actor_id = admin_id
    audit.action = "identity_sync_job_retry"
    audit.target_type = "identity_sync_job"
    audit.target_id = str(job.id)
    audit.payload = {"original_attempts": job.attempts}
    db.add(audit)
    await db.commit()

    user_q = await db.execute(select(User).where(User.id == job.user_id))
    user_row = user_q.scalar_one_or_none()

    return IdentitySyncJobResponse(
        id=str(job.id),
        user_id=str(job.user_id),
        user_email=user_row.email if user_row else None,
        wallet_id=str(job.wallet_id) if job.wallet_id else None,
        action=job.action if isinstance(job.action, str) else job.action.value,
        status=job.status if isinstance(job.status, str) else job.status.value,
        attempts=job.attempts,
        last_error=job.last_error,
        tx_hash=job.tx_hash,
        enqueued_at=job.enqueued_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.post("/emergency-manual-sync", status_code=200)
async def emergency_manual_sync(
    body: EmergencyManualRegisterBody,
    admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Record the result of an admin's manually-signed registry tx.

    The admin's connected wallet has ``REGISTRAR_ROLE`` and signs the
    ``addToWhitelist`` or ``removeFromWhitelist`` call directly from the
    admin UI via wagmi. This endpoint flips the matching ``Wallet`` row's
    ``registered_on_chain`` flag (if a row exists) and writes an audit
    log row so we have a compliance trail.
    """
    from web3 import Web3

    addr = Web3.to_checksum_address(body.wallet_address)

    # Flip the matching wallet row's flag if it exists. The wallet may
    # belong to any user — we look up by address_checksum.
    wallet_q = await db.execute(
        select(Wallet).where(Wallet.address_checksum == addr)
    )
    wallet = wallet_q.scalar_one_or_none()
    if wallet:
        wallet.registered_on_chain = body.action == "add"

    audit = AuditLog()
    audit.actor_id = admin_id
    audit.action = f"identity_registry_emergency_{body.action}"
    audit.target_type = "wallet"
    audit.target_id = addr
    audit.payload = {
        "wallet_address": addr,
        "action": body.action,
        "tx_hash": body.tx_hash,
        "wallet_row_found": wallet is not None,
        "user_id": str(wallet.user_id) if wallet else None,
    }
    db.add(audit)
    await db.commit()

    logger.info(
        "Emergency identity registry %s recorded: addr=%s tx=%s admin=%s wallet_row=%s",
        body.action, addr, body.tx_hash, admin_id, wallet is not None,
    )

    return {
        "status": "recorded",
        "wallet_address": addr,
        "action": body.action,
        "tx_hash": body.tx_hash,
        "wallet_row_updated": wallet is not None,
    }


class BackfillResultItem(BaseModel):
    email: str
    wallet_address: str
    outcome: Literal["already_on_chain", "registered", "failed"]
    tx_hash: str | None = None
    error: str | None = None


class BackfillResponse(BaseModel):
    scanned: int
    already_on_chain: int
    registered: int
    failed: int
    items: list[BackfillResultItem]


@router.post("/backfill", response_model=BackfillResponse)
async def backfill_ir_whitelist(
    _admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: UUID | None = Query(
        None,
        description="Restrict the backfill to a single user. Omit for platform-wide.",
    ),
) -> BackfillResponse:
    """Find every KYC-approved user with `wallet.registered_on_chain = false`
    and re-fire the IR whitelist for them. Idempotent — wallets that are
    already on-chain just get the DB synced; others get an `addToWhitelist`
    tx via the platform's signer.

    This is the manual recovery path for when the inline auto-register
    fast-path silently failed (e.g. transient RPC error, missing worker,
    Redis down).
    """
    from sqlalchemy.orm import selectinload

    from apps.api.services.simple_identity_bridge_service import (
        SimpleIdentityBridgeService,
    )

    # Pull candidates: kyc=approved + at least one wallet not registered.
    # When user_id is supplied, scope to that single user (per-user
    # "Resync IR" button on the user detail page).
    base_query = (
        select(User)
        .options(selectinload(User.wallets))
        .where(User.kyc_status == "approved")
    )
    if user_id is not None:
        base_query = base_query.where(User.id == user_id)
    result = await db.execute(base_query)
    users = list(result.scalars().all())

    candidates: list[tuple[User, Wallet]] = []
    for user in users:
        for w in (user.wallets or []):
            if not w.registered_on_chain:
                candidates.append((user, w))

    if not candidates:
        return BackfillResponse(
            scanned=0, already_on_chain=0, registered=0, failed=0, items=[],
        )

    bridge = SimpleIdentityBridgeService(db)

    already, registered, failed = 0, 0, 0
    items: list[BackfillResultItem] = []

    for user, wallet in candidates:
        addr = wallet.address_checksum
        try:
            # The bridge's register_wallet is idempotent — it reads
            # isVerified first and skips the tx if already whitelisted,
            # then flips the DB flag. We just need to map its outcome.
            outcome = await bridge.register_wallet(user, addr)
            tx_hash = outcome.get("tx_hash") if isinstance(outcome, dict) else None
            already_whitelisted = (
                outcome.get("already_whitelisted") if isinstance(outcome, dict) else False
            )
            if already_whitelisted:
                already += 1
                items.append(BackfillResultItem(
                    email=user.email, wallet_address=addr,
                    outcome="already_on_chain",
                ))
            else:
                registered += 1
                items.append(BackfillResultItem(
                    email=user.email, wallet_address=addr,
                    outcome="registered", tx_hash=tx_hash,
                ))
        except Exception as e:
            failed += 1
            msg = str(e)[:200]
            logger.warning(
                "IR backfill failed for %s (%s): %s", user.email, addr, msg,
            )
            items.append(BackfillResultItem(
                email=user.email, wallet_address=addr,
                outcome="failed", error=msg,
            ))

    logger.info(
        "IR backfill done: scanned=%d already=%d registered=%d failed=%d",
        len(candidates), already, registered, failed,
    )
    return BackfillResponse(
        scanned=len(candidates),
        already_on_chain=already,
        registered=registered,
        failed=failed,
        items=items,
    )
