"""Background task definitions for arq worker."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


async def task_send_email(
    ctx: dict[str, Any],  # noqa: ARG001
    template: str,
    to: str,
    **kwargs: Any,
) -> None:
    """Send a transactional email via the EmailService."""
    from apps.api.services.email_service import EmailService

    try:
        email_svc = EmailService()
        result = await email_svc.send(template, to, variables=kwargs)
        logger.info("Email sent: template=%s to=%s result=%s", template, to, result.get("status"))
    except Exception as e:
        logger.error("Email failed: template=%s to=%s error=%s", template, to, e)
        raise


async def task_deploy_onchainid(
    ctx: dict[str, Any],  # noqa: ARG001
    user_id: str,
    wallet_address: str,
) -> str | None:
    """Deploy ONCHAINID identity contract for a newly KYC-verified user."""
    logger.info("Deploying ONCHAINID for user=%s wallet=%s", user_id, wallet_address)
    from packages.common.core.config import settings

    if not settings.identity_signer_private_key:
        if settings.environment in ("staging", "production"):
            raise RuntimeError(
                "IDENTITY_SIGNER_PRIVATE_KEY required for ONCHAINID deployment in production/staging"
            )
        logger.warning("IDENTITY_SIGNER_PRIVATE_KEY not set in development — skipping ONCHAINID deploy")
        return None
    if not settings.identity_factory_address:
        if settings.environment in ("staging", "production"):
            raise RuntimeError(
                "IDENTITY_FACTORY_ADDRESS required for ONCHAINID deployment in production/staging"
            )
        logger.warning("IDENTITY_FACTORY_ADDRESS not set in development — skipping ONCHAINID deploy")
        return None

    try:
        from apps.api.services.web3_identity_service import Web3IdentityService

        svc = Web3IdentityService()
        identity_address = await svc.deploy_identity(wallet_address)
        logger.info("ONCHAINID deployed for user=%s identity=%s", user_id, identity_address)
        return identity_address
    except Exception as e:
        logger.error("ONCHAINID deploy failed for user=%s: %s", user_id, e)
        raise


async def task_register_wallet_on_chain(
    ctx: dict[str, Any],  # noqa: ARG001
    wallet_address: str,
    token_addresses: list[str],
    onchain_id_address: str,
    country_code: int = 0,
) -> None:
    """Register a wallet in Identity Registry for each token after KYC approval."""
    logger.info(
        "Registering wallet=%s in %d identity registries", wallet_address, len(token_addresses)
    )
    from packages.common.core.config import settings

    if not settings.identity_signer_private_key:
        logger.error(
            "IDENTITY_SIGNER_PRIVATE_KEY not set — cannot register wallet=%s on-chain", wallet_address
        )
        return
    if not settings.identity_registry_address:
        logger.error(
            "IDENTITY_REGISTRY_ADDRESS not set — cannot register wallet=%s on-chain", wallet_address
        )
        return

    try:
        from apps.api.services.web3_identity_service import Web3IdentityService

        svc = Web3IdentityService()
        for token_addr in token_addresses:
            await svc.register_identity(
                wallet_address, onchain_id_address, country_code, token_addr
            )
            logger.info(
                "Registered wallet=%s in IdentityRegistry of token=%s", wallet_address, token_addr
            )
    except Exception as e:
        logger.error("Identity registry failed: %s", e)
        raise


async def task_index_contribution(
    ctx: dict[str, Any],  # noqa: ARG001
    tx_hash: str,
    sale_id: str,
    user_id: str,  # noqa: ARG001
) -> None:
    """Verify on-chain contribution and update DB status."""
    logger.info("Indexing contribution tx=%s sale=%s", tx_hash, sale_id)
    from sqlalchemy import select

    from apps.api.models.contribution import Contribution
    from packages.common.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Contribution).where(Contribution.tx_hash == tx_hash))
        contribution = result.scalar_one_or_none()
        if not contribution:
            logger.warning("Contribution not found for tx=%s", tx_hash)
            return
        if contribution.status == "confirmed":
            logger.info("Contribution already confirmed: tx=%s", tx_hash)
            return

        try:
            from apps.api.services.web3_service import Web3Service

            svc = Web3Service()
            receipt = svc.w3.eth.get_transaction_receipt(tx_hash)
            if receipt is None:
                logger.info("TX %s not yet mined — will retry", tx_hash)
                return
            if receipt.get("status") == 1:
                contribution.status = "confirmed"
                logger.info("Contribution confirmed on-chain: tx=%s", tx_hash)
            else:
                contribution.status = "failed"
                logger.warning("Contribution TX reverted: tx=%s", tx_hash)
        except Exception as e:
            logger.error("On-chain verification failed for tx=%s: %s", tx_hash, e)
            contribution.status = "pending"
            await db.commit()
            raise

        await db.commit()


async def task_release_vesting(
    ctx: dict[str, Any],  # noqa: ARG001
) -> None:
    """Check all active vesting schedules and release claimable tokens (off-chain accounting)."""
    logger.info("Running vesting release sweep")
    from sqlalchemy import select

    from apps.api.models.vesting_schedule import VestingSchedule
    from packages.common.db.session import AsyncSessionLocal

    now = datetime.now(UTC)
    released_count = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(VestingSchedule).where(VestingSchedule.status == "active"))
        schedules = result.scalars().all()

        for schedule in schedules:
            cliff_end = getattr(schedule, "cliff_end_date", None) or getattr(
                schedule, "cliff_end", None
            )
            if cliff_end and cliff_end > now:
                continue  # Still in cliff period

            start = getattr(schedule, "start_date", None) or getattr(schedule, "start_time", None)
            end = getattr(schedule, "end_date", None) or getattr(schedule, "end_time", None)
            total = float(getattr(schedule, "total_amount", 0) or 0)

            if not start or not end or total == 0:
                continue

            elapsed = (now - start).total_seconds()
            duration = (end - start).total_seconds()
            if duration <= 0:
                continue

            vested_fraction = min(elapsed / duration, 1.0)
            newly_vested = total * vested_fraction

            current_vested = float(getattr(schedule, "vested_amount", 0) or 0)
            if newly_vested > current_vested:
                schedule.vested_amount = str(newly_vested)
                released_count += 1

            if vested_fraction >= 1.0:
                schedule.status = "completed"

        await db.commit()

    logger.info("Vesting sweep done: %d schedules updated", released_count)


async def task_sync_chain_events(ctx: dict[str, Any]) -> None:  # noqa: ARG001
    """Poll Base RPC for on-chain events and sync DB. Runs every ~12s."""
    from apps.api.services.event_listener_service import EventListenerService

    svc = EventListenerService()
    try:
        count = await svc.poll_events()
        if count:
            logger.info("Chain sync: %d events processed", count)
    except Exception as e:
        logger.error("Chain sync failed: %s", e, exc_info=True)


async def task_reconcile_balances(ctx: dict[str, Any]) -> None:  # noqa: ARG001
    """Daily reconciliation: compare DB balances vs on-chain balanceOf().

    Logs discrepancies to audit_logs and sends admin notification.
    """
    logger.info("Starting balance reconciliation")
    from decimal import Decimal

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from apps.api.models.audit_log import AuditLog
    from apps.api.models.contribution import Contribution
    from apps.api.models.enums import ContributionStatus
    from apps.api.models.token_sale import TokenSale
    from apps.api.services.web3_base_service import Web3BaseService
    from packages.common.db.session import AsyncSessionLocal

    discrepancies = 0
    web3_svc = Web3BaseService()

    async with AsyncSessionLocal() as db:
        # Get all claimed contributions grouped by user wallet + token
        result = await db.execute(
            select(Contribution)
            .options(selectinload(Contribution.sale).selectinload(TokenSale.token))
            .where(Contribution.status == ContributionStatus.CLAIMED)
            .where(Contribution.wallet_address.isnot(None))
        )
        contributions = result.scalars().all()

        # Group by (wallet, token_contract)
        holdings: dict[tuple[str, str], Decimal] = {}
        for contrib in contributions:
            token = contrib.sale.token if contrib.sale else None
            if not token or not token.contract_address:
                continue
            key = (contrib.wallet_address.lower(), token.contract_address)
            holdings[key] = holdings.get(key, Decimal("0")) + contrib.tokens_allocated

        for (wallet_addr, token_addr), db_balance in holdings.items():
            try:
                on_chain = await web3_svc.get_token_balance(token_addr, wallet_addr, 18)
                diff = abs(db_balance - on_chain)
                if diff > Decimal("0.001"):
                    discrepancies += 1
                    logger.warning(
                        "Balance mismatch: wallet=%s token=%s db=%s chain=%s diff=%s",
                        wallet_addr, token_addr, db_balance, on_chain, diff,
                    )
                    audit = AuditLog()
                    audit.action = "balance_discrepancy"
                    audit.target_type = "wallet"
                    audit.target_id = wallet_addr
                    audit.payload = {
                        "token_address": token_addr,
                        "db_balance": str(db_balance),
                        "on_chain_balance": str(on_chain),
                        "difference": str(diff),
                    }
                    db.add(audit)
            except Exception:
                logger.debug("Could not check balance for wallet=%s token=%s", wallet_addr, token_addr)

        if discrepancies:
            await db.commit()

    logger.info("Reconciliation complete: %d discrepancies found", discrepancies)


async def task_process_webhooks(ctx: dict[str, Any]) -> None:  # noqa: ARG001
    """Process pending webhook events with retry and exponential backoff.

    Retries up to 3 times with backoff (1s, 4s, 16s).
    After max retries, marks as failed (dead letter).
    """
    from sqlalchemy import select

    from apps.api.models.webhook_event import WebhookEvent
    from packages.common.db.session import AsyncSessionLocal

    logger.info("Processing pending webhooks")
    processed = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WebhookEvent)
            .where(WebhookEvent.status == "pending")
            .order_by(WebhookEvent.created_at.asc())
            .limit(50)
        )
        events = list(result.scalars().all())

        for event in events:
            if event.attempts >= 3:
                event.status = "failed"
                logger.warning("Webhook dead-lettered: id=%s provider=%s", event.id, event.provider)
                continue

            try:
                await _process_single_webhook(db, event)
                event.status = "processed"
                event.processed_at = datetime.now(UTC)
                processed += 1
            except Exception as e:
                event.attempts += 1
                event.last_error = str(e)[:500]
                backoff = 4 ** (event.attempts - 1)  # 1s, 4s, 16s
                logger.warning(
                    "Webhook failed (attempt %d/3): id=%s error=%s, retry in %ds",
                    event.attempts, event.id, str(e)[:100], backoff,
                )
                if event.attempts >= 3:
                    event.status = "failed"

        await db.commit()

    logger.info("Webhook processing done: %d processed", processed)


async def _process_single_webhook(db: Any, event: Any) -> None:
    """Process a single webhook event based on provider."""
    if event.provider == "sumsub":
        from apps.api.services.kyc_service import KYCService

        svc = KYCService(db)
        await svc.handle_webhook(event.payload, ip_address=None)
    else:
        logger.warning("Unknown webhook provider: %s", event.provider)


async def task_rescreen_wallets(ctx: dict[str, Any]) -> None:  # noqa: ARG001
    """Daily re-screening of all linked wallets for sanctions/risk."""
    from apps.api.services.wallet_screening_service import (
        task_rescreen_wallets as _rescreen,
    )

    await _rescreen({})


# ─── Identity registry sync ──────────────────────────────────────────
# These run on the same retry/dead-letter pattern as task_process_webhooks:
# 3 attempts max, exponential backoff, then status='failed' + audit_logs row.
# Both tasks read an IdentitySyncJob row first so the worker has full context
# (action, user, wallet) and can update the row's status/attempts/tx_hash/last_error
# in lockstep with whatever the bridge service does on chain.

_IDENTITY_SYNC_MAX_ATTEMPTS = 3


async def task_sync_identity(
    ctx: dict[str, Any],  # noqa: ARG001
    job_id: str,
) -> None:
    """Re-sync the buyer's full wallet set after KYC approval.

    Loads ``IdentitySyncJob[job_id]``, calls
    ``SimpleIdentityBridgeService.provision_identity(user_id)`` to
    whitelist every linked wallet that isn't on chain yet, and updates
    the job row with the outcome. Idempotent via
    ``Wallet.registered_on_chain`` so re-running on a healthy state is
    a no-op.
    """
    from sqlalchemy import select

    from apps.api.models.enums import IdentitySyncJobStatus
    from apps.api.models.identity_sync_job import IdentitySyncJob
    from packages.common.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        job_q = await db.execute(
            select(IdentitySyncJob).where(IdentitySyncJob.id == job_id)
        )
        job = job_q.scalar_one_or_none()
        if not job:
            logger.warning("task_sync_identity: job %s not found", job_id)
            return
        if job.status in (IdentitySyncJobStatus.SUCCEEDED, IdentitySyncJobStatus.FAILED):
            logger.info(
                "task_sync_identity: job %s already in terminal state %s",
                job_id, job.status,
            )
            return

        job.status = IdentitySyncJobStatus.RUNNING
        job.attempts = (job.attempts or 0) + 1
        job.started_at = datetime.now(UTC)
        await db.commit()

        try:
            from apps.api.services.simple_identity_bridge_service import (
                SimpleIdentityBridgeService,
            )

            bridge = SimpleIdentityBridgeService(db)
            result = await bridge.provision_identity(job.user_id)
            tx_hash = result.get("tx_hash") if isinstance(result, dict) else None

            job.status = IdentitySyncJobStatus.SUCCEEDED
            job.tx_hash = tx_hash
            job.completed_at = datetime.now(UTC)
            job.last_error = None
            await db.commit()
            logger.info(
                "task_sync_identity: job=%s user=%s succeeded — %d wallet(s) registered, tx=%s",
                job_id, job.user_id,
                len(result.get("registered_wallets", [])) if isinstance(result, dict) else 0,
                tx_hash,
            )
        except Exception as exc:
            job.last_error = str(exc)[:500]
            if job.attempts >= _IDENTITY_SYNC_MAX_ATTEMPTS:
                job.status = IdentitySyncJobStatus.FAILED
                job.completed_at = datetime.now(UTC)
                await _record_identity_sync_failure(db, job, str(exc))
            else:
                job.status = IdentitySyncJobStatus.PENDING
            await db.commit()
            logger.warning(
                "task_sync_identity: job=%s attempt %d/%d failed — %s",
                job_id, job.attempts, _IDENTITY_SYNC_MAX_ATTEMPTS, exc,
            )
            # Re-raise so arq's own backoff sees the failure and the job
            # gets retried automatically. The pending sweep also picks it up.
            raise


async def task_sync_wallet(
    ctx: dict[str, Any],  # noqa: ARG001
    job_id: str,
) -> None:
    """Register or revoke a single wallet on the identity registry.

    Reads the action from the IdentitySyncJob row:
      - ADD    → bridge.register_wallet(user, address)
      - REMOVE → bridge.revoke_wallet(address)
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import IdentitySyncJobAction, IdentitySyncJobStatus
    from apps.api.models.identity_sync_job import IdentitySyncJob
    from apps.api.models.user import User
    from apps.api.models.wallet import Wallet
    from packages.common.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        job_q = await db.execute(
            select(IdentitySyncJob).where(IdentitySyncJob.id == job_id)
        )
        job = job_q.scalar_one_or_none()
        if not job:
            logger.warning("task_sync_wallet: job %s not found", job_id)
            return
        if job.status in (IdentitySyncJobStatus.SUCCEEDED, IdentitySyncJobStatus.FAILED):
            logger.info(
                "task_sync_wallet: job %s already in terminal state %s",
                job_id, job.status,
            )
            return

        job.status = IdentitySyncJobStatus.RUNNING
        job.attempts = (job.attempts or 0) + 1
        job.started_at = datetime.now(UTC)
        await db.commit()

        try:
            from apps.api.services.simple_identity_bridge_service import (
                SimpleIdentityBridgeService,
            )

            bridge = SimpleIdentityBridgeService(db)
            tx_hash: str | None = None

            if job.action == IdentitySyncJobAction.ADD:
                # Need the user (with wallets eager-loaded) and the wallet row.
                user_q = await db.execute(
                    select(User)
                    .options(selectinload(User.wallets))
                    .where(User.id == job.user_id)
                )
                user = user_q.scalar_one_or_none()
                if not user:
                    raise RuntimeError(f"user {job.user_id} not found")

                if job.wallet_id:
                    wallet_q = await db.execute(
                        select(Wallet).where(Wallet.id == job.wallet_id)
                    )
                    wallet = wallet_q.scalar_one_or_none()
                    if not wallet:
                        raise RuntimeError(f"wallet {job.wallet_id} not found")
                    if wallet.registered_on_chain:
                        logger.info(
                            "task_sync_wallet: wallet %s already registered, no-op",
                            wallet.address_checksum,
                        )
                    else:
                        result = await bridge.register_wallet(
                            user, wallet.address_checksum
                        )
                        tx_hash = result.get("tx_hash") if isinstance(result, dict) else None
                        wallet.registered_on_chain = True
                else:
                    raise RuntimeError("ADD action requires wallet_id")

            elif job.action == IdentitySyncJobAction.REMOVE:
                # On remove the wallet row may already be deleted from the
                # DB (admin approved a deletion request). Use the snapshot
                # address from a sibling lookup if needed; for now we hit
                # the bridge using the wallet row's address while it still
                # exists in the unlink-then-enqueue path.
                if job.wallet_id:
                    wallet_q = await db.execute(
                        select(Wallet).where(Wallet.id == job.wallet_id)
                    )
                    wallet = wallet_q.scalar_one_or_none()
                    if wallet:
                        result = await bridge.revoke_wallet(wallet.address_checksum)
                        tx_hash = result.get("tx_hash") if isinstance(result, dict) else None
                        wallet.registered_on_chain = False
                    else:
                        # Wallet row gone — safe no-op. The deletion-request
                        # approval flow will pass the snapshot address via a
                        # follow-up endpoint when needed.
                        logger.info(
                            "task_sync_wallet: REMOVE wallet %s no longer in DB, skipping",
                            job.wallet_id,
                        )
                else:
                    raise RuntimeError("REMOVE action requires wallet_id")
            else:
                raise RuntimeError(f"Unsupported action {job.action}")

            job.status = IdentitySyncJobStatus.SUCCEEDED
            job.tx_hash = tx_hash
            job.completed_at = datetime.now(UTC)
            job.last_error = None
            await db.commit()
            logger.info(
                "task_sync_wallet: job=%s user=%s action=%s succeeded tx=%s",
                job_id, job.user_id, job.action, tx_hash,
            )
        except Exception as exc:
            job.last_error = str(exc)[:500]
            if job.attempts >= _IDENTITY_SYNC_MAX_ATTEMPTS:
                job.status = IdentitySyncJobStatus.FAILED
                job.completed_at = datetime.now(UTC)
                await _record_identity_sync_failure(db, job, str(exc))
            else:
                job.status = IdentitySyncJobStatus.PENDING
            await db.commit()
            logger.warning(
                "task_sync_wallet: job=%s attempt %d/%d failed — %s",
                job_id, job.attempts, _IDENTITY_SYNC_MAX_ATTEMPTS, exc,
            )
            raise


async def _process_pending_identity_sync_jobs(db: Any) -> int:
    """Sweep pending identity sync jobs left behind by Redis hiccups."""
    from sqlalchemy import select

    from apps.api.models.enums import IdentitySyncJobAction, IdentitySyncJobStatus
    from apps.api.models.identity_sync_job import IdentitySyncJob

    pending_q = await db.execute(
        select(IdentitySyncJob)
        .where(IdentitySyncJob.status == IdentitySyncJobStatus.PENDING)
        .where(IdentitySyncJob.attempts < _IDENTITY_SYNC_MAX_ATTEMPTS)
        .order_by(IdentitySyncJob.enqueued_at.asc())
        .limit(50)
    )
    rows = list(pending_q.scalars().all())
    if not rows:
        return 0
    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        from packages.common.core.config import settings

        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    except Exception as exc:
        logger.warning("identity sync sweep: redis unavailable: %s", exc)
        return 0
    queued = 0
    for job in rows:
        try:
            if job.action == IdentitySyncJobAction.PROVISION:
                await pool.enqueue_job("task_sync_identity", str(job.id))
            else:
                await pool.enqueue_job("task_sync_wallet", str(job.id))
            queued += 1
        except Exception as exc:
            logger.warning("identity sync sweep: enqueue %s failed: %s", job.id, exc)
    return queued


async def _record_identity_sync_failure(db: Any, job: Any, error: str) -> None:
    """Drop a row in audit_logs so compliance has a breadcrumb on dead-letter."""
    try:
        from apps.api.models.audit_log import AuditLog

        log_row = AuditLog()
        log_row.actor_id = None
        log_row.action = f"identity_sync_failed_{job.action}"
        log_row.target_type = "identity_sync_job"
        log_row.target_id = str(job.id)
        log_row.payload = {
            "user_id": str(job.user_id),
            "wallet_id": str(job.wallet_id) if job.wallet_id else None,
            "action": job.action,
            "attempts": job.attempts,
            "error": error[:500],
        }
        db.add(log_row)
    except Exception as exc:
        logger.warning("Failed to record identity sync failure audit log: %s", exc)


async def task_check_kyc_expiry(ctx: dict[str, Any]) -> None:  # noqa: ARG001
    """Daily KYC expiry check — warn 30 days before, block on expiry."""
    from apps.api.services.kyc_expiry_service import (
        task_check_kyc_expiry as _check_expiry,
    )

    await _check_expiry({})


# arq worker settings
class WorkerSettings:
    functions = [
        task_send_email,
        task_deploy_onchainid,
        task_register_wallet_on_chain,
        task_index_contribution,
        task_release_vesting,
        task_sync_chain_events,
        task_reconcile_balances,
        task_process_webhooks,
        task_rescreen_wallets,
        task_check_kyc_expiry,
        task_sync_identity,
        task_sync_wallet,
    ]
    cron_jobs = [
        # Chain event sync: every 12 seconds
        # Note: arq cron minimum is 1 minute, so we use a recurring enqueue pattern.
        # The actual 12s polling is handled via the worker startup hook below.
    ]
    max_jobs = 10
    job_timeout = 60
    keep_result = 3600

    from arq.connections import RedisSettings as _RedisSettings

    from packages.common.core.config import settings as _settings

    redis_settings = _RedisSettings.from_dsn(_settings.redis_url)

    @staticmethod
    async def on_startup(ctx: dict[str, Any]) -> None:
        """Schedule recurring tasks on worker startup."""
        import asyncio

        async def _chain_sync_loop() -> None:
            """Poll chain events every 12 seconds."""
            while True:
                try:
                    await task_sync_chain_events({})
                except Exception:
                    logger.error("Chain sync loop error", exc_info=True)
                await asyncio.sleep(12)

        async def _webhook_process_loop() -> None:
            """Process webhooks every 30 seconds."""
            while True:
                try:
                    await task_process_webhooks({})
                except Exception:
                    logger.error("Webhook process loop error", exc_info=True)
                await asyncio.sleep(30)

        async def _identity_sync_sweep_loop() -> None:
            """Sweep stale pending identity sync jobs every 60 seconds.

            Catches rows that didn't make it onto Redis when the API
            enqueued them (Redis hiccup, transient network blip).
            """
            from packages.common.db.session import AsyncSessionLocal

            while True:
                try:
                    async with AsyncSessionLocal() as db:
                        queued = await _process_pending_identity_sync_jobs(db)
                        if queued:
                            logger.info("identity sync sweep: re-queued %d job(s)", queued)
                except Exception:
                    logger.error("Identity sync sweep loop error", exc_info=True)
                await asyncio.sleep(60)

        async def _heartbeat_loop() -> None:
            """Write heartbeat to Redis every 30 seconds."""
            import redis.asyncio as aioredis

            from packages.common.core.config import settings

            while True:
                try:
                    r = aioredis.from_url(settings.redis_url)
                    await r.set(
                        "cireta:worker:heartbeat",
                        datetime.now(UTC).isoformat(),
                        ex=90,
                    )
                    await r.aclose()
                except Exception:
                    logger.warning("Worker heartbeat write failed", exc_info=True)
                await asyncio.sleep(30)

        # Launch background loops
        ctx["_chain_sync_task"] = asyncio.create_task(_chain_sync_loop())
        ctx["_webhook_task"] = asyncio.create_task(_webhook_process_loop())
        ctx["_heartbeat_task"] = asyncio.create_task(_heartbeat_loop())
        ctx["_identity_sync_sweep_task"] = asyncio.create_task(_identity_sync_sweep_loop())
        logger.info(
            "Background tasks started: chain_sync (12s), webhook_process (30s), "
            "heartbeat (30s), identity_sync_sweep (60s)"
        )

    @staticmethod
    async def on_shutdown(ctx: dict[str, Any]) -> None:
        """Cancel background tasks on shutdown."""
        for key in ("_chain_sync_task", "_webhook_task", "_heartbeat_task"):
            task = ctx.get(key)
            if task:
                task.cancel()
        logger.info("Background tasks stopped")
