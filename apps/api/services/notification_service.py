"""Notification service — creates in-app notifications and triggers emails."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.notification import Notification
from apps.api.services.email_service import EmailService

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
        email_template_key: str | None = None,
        email_to: str | None = None,
        email_variables: dict[str, str] | None = None,
    ) -> Notification:
        """Create in-app notification and optionally send email via template."""
        notif = Notification()
        notif.user_id = user_id
        notif.type = notif_type
        notif.title = title
        notif.message = message
        notif.data = data or {}
        self.db.add(notif)

        if send_email and email_template_key and email_to:
            try:
                email_svc = EmailService(self.db)
                await email_svc.send(email_template_key, email_to, email_variables or {})
                notif.emailed = True
            except Exception as e:
                logger.warning("Email send failed for notification %s: %s", notif_type, e)

        await self.db.commit()
        await self.db.refresh(notif)
        return notif

    async def notify_investment_confirmed(
        self,
        user_id: UUID,
        user_email: str,
        amount: str,
        token_name: str,
        display_name: str = "",
        tokens_allocated: str = "",
    ) -> None:
        await self.create(
            user_id=user_id,
            notif_type=INVESTMENT_CONFIRMED,
            title="Investment Confirmed",
            message=f"Your investment of {amount} USDC in {token_name} has been confirmed.",
            data={"amount": amount, "token_name": token_name},
            send_email=True,
            email_template_key="investment_confirmation",
            email_to=user_email,
            email_variables={
                "display_name": display_name,
                "token_name": token_name,
                "amount": amount,
                "tokens_allocated": tokens_allocated,
            },
        )

    async def notify_kyc_approved(
        self, user_id: UUID, user_email: str, display_name: str = ""
    ) -> None:
        await self.create(
            user_id=user_id,
            notif_type=KYC_APPROVED,
            title="KYC Verified",
            message="Your identity has been verified. You can now invest.",
            send_email=True,
            email_template_key="kyc_approved",
            email_to=user_email,
            email_variables={"display_name": display_name},
        )

    async def notify_kyc_rejected(
        self, user_id: UUID, user_email: str, display_name: str = "", reason: str = ""
    ) -> None:
        await self.create(
            user_id=user_id,
            notif_type=KYC_REJECTED,
            title="KYC Not Approved",
            message="Your identity verification was not approved. Please review and try again.",
            data={"reason": reason},
            send_email=True,
            email_template_key="kyc_rejected",
            email_to=user_email,
            email_variables={"display_name": display_name},
        )

    async def notify_sale_finalized(
        self,
        user_id: UUID,
        user_email: str,
        token_name: str,
        success: bool,
        display_name: str = "",
    ) -> None:
        if success:
            title = "Tokens Available to Claim"
            message = f"The {token_name} sale has finalized. Your tokens are ready to claim."
            template_key = "sale_finalized_success"
        else:
            title = "Sale Failed — Refund Available"
            message = f"The {token_name} sale did not reach its target. Your refund is available."
            template_key = "sale_finalized_failed"

        await self.create(
            user_id=user_id,
            notif_type=SALE_FINALIZED_SUCCESS if success else SALE_FINALIZED_FAILED,
            title=title,
            message=message,
            data={"token_name": token_name, "success": success},
            send_email=True,
            email_template_key=template_key,
            email_to=user_email,
            email_variables={"display_name": display_name, "token_name": token_name},
        )

    async def notify_redemption_fulfilled(
        self,
        user_id: UUID,
        user_email: str,
        token_symbol: str,
        display_name: str = "",
    ) -> None:
        await self.create(
            user_id=user_id,
            notif_type=REDEMPTION_FULFILLED,
            title="Redemption Fulfilled",
            message=f"Your {token_symbol} redemption has been fulfilled.",
            data={"token_symbol": token_symbol},
            send_email=True,
            email_template_key="redemption_fulfilled",
            email_to=user_email,
            email_variables={"display_name": display_name, "token_symbol": token_symbol},
        )

    async def notify_wallet_linked(
        self,
        user_id: UUID,
        user_email: str,
        wallet_short: str,
        display_name: str = "",
    ) -> None:
        await self.create(
            user_id=user_id,
            notif_type=WALLET_LINKED,
            title="Wallet Linked",
            message=f"Wallet {wallet_short} has been linked to your account.",
            data={"wallet_short": wallet_short},
            send_email=True,
            email_template_key="wallet_linked",
            email_to=user_email,
            email_variables={
                "display_name": display_name,
                "wallet_address": wallet_short,
            },
        )
