"""Notification service — creates in-app notifications and triggers emails."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.notification import Notification

logger = logging.getLogger(__name__)

# Notification types
INVESTMENT_CONFIRMED = "investment_confirmed"
SALE_FINALIZED_SUCCESS = "sale_finalized_success"
SALE_FINALIZED_FAILED = "sale_finalized_failed"
KYC_APPROVED = "kyc_approved"
KYC_REJECTED = "kyc_rejected"
TOKENS_CLAIMED = "tokens_claimed"
REFUND_CLAIMED = "refund_claimed"
DIVIDEND_AVAILABLE = "dividend_available"
REDEMPTION_FULFILLED = "redemption_fulfilled"
WALLET_LINKED = "wallet_linked"
TOKEN_RECOVERY = "token_recovery"


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_id: UUID,
        notif_type: str,
        title: str,
        message: str,
        data: dict[str, Any] | None = None,
        send_email: bool = False,
        email_fn: Any = None,
        email_args: tuple = (),
    ) -> Notification:
        """Create in-app notification and optionally send email."""
        notif = Notification()
        notif.user_id = user_id
        notif.type = notif_type
        notif.title = title
        notif.message = message
        notif.data = data or {}
        self.db.add(notif)

        if send_email and email_fn:
            try:
                await email_fn(*email_args)
                notif.emailed = True
            except Exception as e:
                logger.warning("Email send failed for notification %s: %s", notif_type, e)

        await self.db.commit()
        await self.db.refresh(notif)
        return notif

    async def notify_investment_confirmed(
        self, user_id: UUID, user_email: str, amount: str, token_symbol: str, tx_hash: str
    ) -> None:
        from apps.api.services.email_service import send_investment_confirmed

        await self.create(
            user_id=user_id,
            notif_type=INVESTMENT_CONFIRMED,
            title="Investment Confirmed",
            message=f"Your investment of {amount} USDC in {token_symbol} has been confirmed.",
            data={"amount": amount, "token_symbol": token_symbol, "tx_hash": tx_hash},
            send_email=True,
            email_fn=send_investment_confirmed,
            email_args=(user_email, amount, token_symbol, tx_hash),
        )

    async def notify_kyc_approved(self, user_id: UUID, user_email: str, kyc_level: int) -> None:
        from apps.api.services.email_service import send_kyc_approved

        await self.create(
            user_id=user_id,
            notif_type=KYC_APPROVED,
            title="KYC Verified",
            message=f"Your identity has been verified (Level {kyc_level}). You can now invest.",
            data={"kyc_level": kyc_level},
            send_email=True,
            email_fn=send_kyc_approved,
            email_args=(user_email, kyc_level),
        )

    async def notify_kyc_rejected(self, user_id: UUID, user_email: str, reason: str = "") -> None:
        from apps.api.services.email_service import send_kyc_rejected

        await self.create(
            user_id=user_id,
            notif_type=KYC_REJECTED,
            title="KYC Not Approved",
            message="Your identity verification was not approved. Please review and try again.",
            data={"reason": reason},
            send_email=True,
            email_fn=send_kyc_rejected,
            email_args=(user_email, reason),
        )

    async def notify_sale_finalized(
        self, user_id: UUID, user_email: str, token_symbol: str, success: bool
    ) -> None:
        from apps.api.services.email_service import send_sale_finalized

        if success:
            title = "Tokens Available to Claim"
            message = f"The {token_symbol} sale has finalized. Your tokens are ready to claim."
        else:
            title = "Sale Failed — Refund Available"
            message = f"The {token_symbol} sale did not reach its target. Your refund is available."
        await self.create(
            user_id=user_id,
            notif_type=SALE_FINALIZED_SUCCESS if success else SALE_FINALIZED_FAILED,
            title=title,
            message=message,
            data={"token_symbol": token_symbol, "success": success},
            send_email=True,
            email_fn=send_sale_finalized,
            email_args=(user_email, token_symbol, success),
        )

    async def notify_redemption_fulfilled(
        self, user_id: UUID, user_email: str, token_symbol: str
    ) -> None:
        from apps.api.services.email_service import send_redemption_fulfilled

        await self.create(
            user_id=user_id,
            notif_type=REDEMPTION_FULFILLED,
            title="Redemption Fulfilled",
            message=f"Your {token_symbol} redemption has been fulfilled.",
            data={"token_symbol": token_symbol},
            send_email=True,
            email_fn=send_redemption_fulfilled,
            email_args=(user_email, token_symbol),
        )
