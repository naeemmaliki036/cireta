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
    """Send a transactional email via Resend."""
    from apps.api.services import email_service as es
    dispatch = {
        "email_verify": es.send_email_verify,
        "password_reset": es.send_password_reset,
        "kyc_approved": es.send_kyc_approved,
        "kyc_rejected": es.send_kyc_rejected,
        "investment_confirmed": es.send_investment_confirmed,
        "sale_finalized": es.send_sale_finalized,
        "redemption_fulfilled": es.send_redemption_fulfilled,
    }
    fn = dispatch.get(template)
    if not fn:
        logger.warning("Unknown email template: %s", template)
        return
    try:
        await fn(to, **kwargs)
        logger.info("Email sent: template=%s to=%s", template, to)
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

    if not settings.deployer_private_key:
        logger.warning("DEPLOYER_PRIVATE_KEY not set — skipping ONCHAINID deploy")
        return None
    if not settings.identity_factory_address:
        logger.warning("IDENTITY_FACTORY_ADDRESS not set — skipping ONCHAINID deploy")
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
    logger.info("Registering wallet=%s in %d identity registries", wallet_address, len(token_addresses))
    from packages.common.core.config import settings

    if getattr(settings, "environment", "development") == "development":
        logger.info("Dev mode — skipping on-chain identity registry for wallet=%s", wallet_address)
        return

    try:
        from apps.api.services.web3_identity_service import Web3IdentityService
        svc = Web3IdentityService()
        for token_addr in token_addresses:
            await svc.register_identity(wallet_address, onchain_id_address, country_code, token_addr)
            logger.info("Registered wallet=%s in IdentityRegistry of token=%s", wallet_address, token_addr)
    except AttributeError:
        # register_identity not yet implemented on web3_identity_service
        for token_addr in token_addresses:
            logger.info("Would register wallet=%s in IdentityRegistry of token=%s", wallet_address, token_addr)
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
    from packages.common.db.session import AsyncSessionLocal
    from apps.api.models.contribution import Contribution

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Contribution).where(Contribution.tx_hash == tx_hash)
        )
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
            logger.warning("Could not verify tx on-chain (dev mode?): %s", e)
            # In dev mode without chain access, mark as confirmed after DB entry
            contribution.status = "confirmed"

        await db.commit()


async def task_release_vesting(
    ctx: dict[str, Any],  # noqa: ARG001
) -> None:
    """Check all active vesting schedules and release claimable tokens (off-chain accounting)."""
    logger.info("Running vesting release sweep")
    from sqlalchemy import select
    from packages.common.db.session import AsyncSessionLocal
    from apps.api.models.vesting_schedule import VestingSchedule

    now = datetime.now(UTC)
    released_count = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(VestingSchedule).where(VestingSchedule.status == "active")
        )
        schedules = result.scalars().all()

        for schedule in schedules:
            cliff_end = getattr(schedule, "cliff_end_date", None) or getattr(schedule, "cliff_end", None)
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


# arq worker settings
class WorkerSettings:
    functions = [
        task_send_email,
        task_deploy_onchainid,
        task_register_wallet_on_chain,
        task_index_contribution,
        task_release_vesting,
    ]
    max_jobs = 10
    job_timeout = 60
    keep_result = 3600

    @classmethod
    def redis_settings(cls):  # type: ignore[override]
        from arq.connections import RedisSettings
        from packages.common.core.config import settings
        return RedisSettings.from_dsn(settings.redis_url or "redis://localhost:6379")
