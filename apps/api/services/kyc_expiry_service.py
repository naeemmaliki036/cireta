"""KYC expiry monitoring — daily task to warn and block expired KYC."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import KYCStatus
from apps.api.models.user import User

logger = logging.getLogger(__name__)

WARNING_DAYS = 30


async def check_expiring_users(db: AsyncSession) -> tuple[int, int]:
    """Check all users for KYC expiry.

    Returns:
        (warned_count, expired_count)
    """
    now = datetime.now(UTC)
    warning_cutoff = now + timedelta(days=WARNING_DAYS)

    # Users with KYC expiring within 30 days (not yet expired)
    result = await db.execute(
        select(User).where(
            User.kyc_expires_at.isnot(None),
            User.kyc_expires_at <= warning_cutoff,
            User.kyc_expires_at > now,
            User.kyc_status == KYCStatus.APPROVED,
        )
    )
    expiring_users = list(result.scalars().all())

    # Send warning emails
    warned = 0
    for user in expiring_users:
        try:
            from apps.api.services.email_service import send_kyc_expiry_warning

            expires = user.kyc_expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=UTC)
            days_left = (expires - now).days
            await send_kyc_expiry_warning(user.email, days_left)
            warned += 1
        except Exception:
            logger.error("Failed to send KYC warning to user=%s", user.id, exc_info=True)

    # Users with expired KYC — block
    expired_result = await db.execute(
        select(User).where(
            User.kyc_expires_at.isnot(None),
            User.kyc_expires_at <= now,
            User.kyc_status == KYCStatus.APPROVED,
        )
    )
    expired_users = list(expired_result.scalars().all())

    expired = 0
    for user in expired_users:
        user.kyc_level = 0
        user.kyc_status = KYCStatus.EXPIRED
        expired += 1
        logger.info(
            "KYC expired for user=%s email=%s — level set to 0",
            user.id,
            user.email,
        )

    if expired:
        await db.commit()

    return warned, expired


async def task_check_kyc_expiry(ctx: dict) -> None:  # noqa: ARG001
    """Daily background task: check KYC expiry across all users."""
    from packages.common.db.session import AsyncSessionLocal

    logger.info("Starting daily KYC expiry check")

    async with AsyncSessionLocal() as db:
        warned, expired = await check_expiring_users(db)

    logger.info(
        "KYC expiry check complete: %d warnings sent, %d users expired",
        warned,
        expired,
    )
