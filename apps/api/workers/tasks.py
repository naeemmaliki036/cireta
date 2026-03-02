"""Background task definitions for arq worker."""

from __future__ import annotations

import logging
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
        raise  # arq will retry


async def task_deploy_onchainid(
    ctx: dict[str, Any],  # noqa: ARG001
    user_id: str,
    wallet_address: str,
) -> str | None:
    """Deploy ONCHAINID identity contract for a newly KYC-verified user.

    Returns:
        The deployed identity contract address, or None if skipped.
    """
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
        logger.info(
            "ONCHAINID deployed for user=%s identity=%s",
            user_id,
            identity_address,
        )
        return identity_address
    except Exception as e:
        logger.error("ONCHAINID deploy failed for user=%s: %s", user_id, e)
        raise


async def task_register_wallet_on_chain(
    ctx: dict[str, Any],  # noqa: ARG001
    wallet_address: str,
    token_addresses: list[str],
    onchain_id_address: str,  # noqa: ARG001
) -> None:
    """Register a wallet in Identity Registry for each token after KYC approval."""
    logger.info("Registering wallet=%s in %d identity registries", wallet_address, len(token_addresses))
    # TODO: call identityRegistry.registerIdentity(wallet, onchainId, countryCode)
    # Stub for now
    for token_addr in token_addresses:
        logger.info("Would register wallet=%s in IdentityRegistry of token=%s", wallet_address, token_addr)


async def task_index_contribution(
    ctx: dict[str, Any],  # noqa: ARG001
    tx_hash: str,
    sale_id: str,
    user_id: str,  # noqa: ARG001
) -> None:
    """Verify on-chain contribution matches DB record."""
    logger.info("Indexing contribution tx=%s sale=%s", tx_hash, sale_id)
    # TODO: read from chain via web3, verify amounts match DB
    pass


# arq worker settings
class WorkerSettings:
    functions = [
        task_send_email,
        task_deploy_onchainid,
        task_register_wallet_on_chain,
        task_index_contribution,
    ]
    max_jobs = 10
    job_timeout = 60
    keep_result = 3600

    @classmethod
    def redis_settings(cls):  # type: ignore[override]
        from arq.connections import RedisSettings

        from packages.common.core.config import settings
        return RedisSettings.from_dsn(settings.redis_url or "redis://localhost:6379")
