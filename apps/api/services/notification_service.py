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
SALE_SUBMITTED_FOR_APPROVAL = "sale_submitted_for_approval"
SALE_APPROVED = "sale_approved"
SALE_REJECTED = "sale_rejected"
SALE_ACTIVATED = "sale_activated"
REDEMPTION_REQUESTED = "redemption_requested"
ISSUER_APPROVED = "issuer_approved"
ISSUER_WALLET_APPROVED = "issuer_wallet_approved"
ISSUER_WALLET_REJECTED = "issuer_wallet_rejected"


# Block-explorer URLs by chain id. Used to build a "View Transaction" link
# in the investment-confirmation email. Add new chains here as needed —
# falls back to an empty string (which the template treats as no link).
_BLOCK_EXPLORERS: dict[int, str] = {
    1: "https://etherscan.io",
    8453: "https://basescan.org",
    84532: "https://sepolia.basescan.org",
    11155111: "https://sepolia.etherscan.io",
    137: "https://polygonscan.com",
}


def _block_explorer_tx_url(tx_hash: str | None) -> str:
    if not tx_hash:
        return ""
    try:
        from packages.common.core.config import settings as _settings

        base = _BLOCK_EXPLORERS.get(int(_settings.chain_id), "")
    except Exception:
        base = ""
    return f"{base}/tx/{tx_hash}" if base else ""


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
        tx_hash: str | None = None,
        payment_method: str = "USDC",
        otc_reference: str | None = None,
    ) -> None:
        """Send the post-purchase confirmation.

        Works for both USDC contributions (real on-chain tx_hash → block
        explorer link) and OTC allocations (otc_reference → no link, just
        shown as the buyer's reference). The template renders both paths
        through the same {{tx_reference}} / {{tx_url}} placeholders so we
        keep a single email design.
        """
        is_otc = payment_method.upper() == "OTC"
        tx_reference = otc_reference or tx_hash or ""
        tx_url = "" if is_otc else _block_explorer_tx_url(tx_hash)
        unit = "tokens" if is_otc else "USDC"
        await self.create(
            user_id=user_id,
            notif_type=INVESTMENT_CONFIRMED,
            title="Investment Confirmed",
            message=(
                f"Your {payment_method} purchase of {amount} {unit} "
                f"in {token_name} has been confirmed."
            ),
            data={
                "amount": amount,
                "token_name": token_name,
                "payment_method": payment_method,
                "tx_hash": tx_hash,
                "otc_reference": otc_reference,
            },
            send_email=True,
            email_template_key="investment_confirmation",
            email_to=user_email,
            email_variables={
                "display_name": display_name,
                "token_name": token_name,
                "amount": amount,
                "tokens_allocated": tokens_allocated,
                "payment_method": payment_method,
                "tx_reference": tx_reference,
                "tx_url": tx_url,
            },
        )

    async def notify_sale_submitted_for_approval(
        self,
        admin_user_id: UUID,
        admin_email: str,
        sale_id: UUID,
        sale_title: str,
        issuer_name: str,
        admin_display_name: str = "",
    ) -> None:
        """Tell platform admins a new sale is in their review queue."""
        await self.create(
            user_id=admin_user_id,
            notif_type=SALE_SUBMITTED_FOR_APPROVAL,
            title="Sale awaiting your approval",
            message=f"{issuer_name} submitted '{sale_title}' for review.",
            data={"sale_id": str(sale_id), "sale_title": sale_title, "issuer_name": issuer_name},
            send_email=True,
            email_template_key="sale_submitted_for_approval",
            email_to=admin_email,
            email_variables={
                "display_name": admin_display_name,
                "sale_title": sale_title,
                "issuer_name": issuer_name,
                "sale_id": str(sale_id),
            },
        )

    async def notify_sale_approved(
        self,
        issuer_user_id: UUID,
        issuer_email: str,
        sale_id: UUID,
        sale_title: str,
        issuer_display_name: str = "",
    ) -> None:
        """Tell the issuer their sale was approved and they can now activate."""
        await self.create(
            user_id=issuer_user_id,
            notif_type=SALE_APPROVED,
            title="Sale approved — ready to activate",
            message=f"'{sale_title}' has been approved. Sign Activate Sale On-Chain to make it live.",
            data={"sale_id": str(sale_id), "sale_title": sale_title},
            send_email=True,
            email_template_key="sale_approved",
            email_to=issuer_email,
            email_variables={
                "display_name": issuer_display_name,
                "sale_title": sale_title,
                "sale_id": str(sale_id),
            },
        )

    async def notify_sale_rejected(
        self,
        issuer_user_id: UUID,
        issuer_email: str,
        sale_id: UUID,
        sale_title: str,
        reason: str | None,
        issuer_display_name: str = "",
    ) -> None:
        await self.create(
            user_id=issuer_user_id,
            notif_type=SALE_REJECTED,
            title="Sale rejected by admin",
            message=f"'{sale_title}' was rejected. Edit and resubmit when ready.",
            data={"sale_id": str(sale_id), "sale_title": sale_title, "reason": reason},
            send_email=True,
            email_template_key="sale_rejected",
            email_to=issuer_email,
            email_variables={
                "display_name": issuer_display_name,
                "sale_title": sale_title,
                "reason": reason or "",
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

    async def notify_sale_activated_admin(
        self,
        admin_user_id: UUID,
        admin_email: str,
        sale_id: UUID,
        sale_title: str,
        issuer_name: str,
        admin_display_name: str = "",
    ) -> None:
        """Tell admins an issuer just activated their sale on-chain — they now
        need to flip is_visible so the launchpad shows it."""
        await self.create(
            user_id=admin_user_id,
            notif_type=SALE_ACTIVATED,
            title="Sale activated — ready to publish",
            message=f"{issuer_name} activated '{sale_title}' on-chain. Click Publish on Launchpad to make it visible to buyers.",
            data={"sale_id": str(sale_id), "sale_title": sale_title, "issuer_name": issuer_name},
            send_email=True,
            email_template_key="sale_activated_admin",
            email_to=admin_email,
            email_variables={
                "display_name": admin_display_name,
                "sale_title": sale_title,
                "issuer_name": issuer_name,
                "sale_id": str(sale_id),
            },
        )

    async def notify_redemption_requested(
        self,
        issuer_user_id: UUID,
        issuer_email: str,
        token_symbol: str,
        token_name: str,
        amount: str,
        investor_address: str,
        onchain_id: int,
        issuer_display_name: str = "",
    ) -> None:
        """Tell the issuer an investor has just requested a redemption — they
        need to fulfil it from the admin dashboard (or RedemptionManager)."""
        await self.create(
            user_id=issuer_user_id,
            notif_type=REDEMPTION_REQUESTED,
            title="New redemption request",
            message=f"An investor requested redemption of {amount} {token_symbol}. Review and fulfil from the admin dashboard.",
            data={
                "token_symbol": token_symbol,
                "token_name": token_name,
                "amount": amount,
                "investor_address": investor_address,
                "onchain_id": onchain_id,
            },
            send_email=True,
            email_template_key="redemption_requested",
            email_to=issuer_email,
            email_variables={
                "display_name": issuer_display_name,
                "token_symbol": token_symbol,
                "token_name": token_name,
                "amount": amount,
                "investor_address": investor_address,
            },
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

    async def notify_issuer_approved(
        self,
        user_id: UUID,
        user_email: str,
        issuer_name: str,
        display_name: str = "",
    ) -> None:
        """Tell an issuer their account was approved and they can now deploy tokens."""
        await self.create(
            user_id=user_id,
            notif_type=ISSUER_APPROVED,
            title="Issuer account approved",
            message=f"{issuer_name} is now an active issuer. You can deploy tokens and create sales.",
            data={"issuer_name": issuer_name},
            send_email=True,
            email_template_key="issuer_approved",
            email_to=user_email,
            email_variables={"display_name": display_name, "issuer_name": issuer_name},
        )

    async def notify_issuer_wallet_approved(
        self,
        user_id: UUID,
        user_email: str,
        wallet_address: str,
        display_name: str = "",
    ) -> None:
        """Tell an issuer their wallet was approved by the admin."""
        short = f"{wallet_address[:6]}…{wallet_address[-4:]}"
        await self.create(
            user_id=user_id,
            notif_type=ISSUER_WALLET_APPROVED,
            title="Issuer wallet approved",
            message=f"Your wallet {short} has been approved. You can now sign on-chain operations.",
            data={"wallet_address": wallet_address},
            send_email=True,
            email_template_key="issuer_wallet_approved",
            email_to=user_email,
            email_variables={"display_name": display_name, "wallet_address": wallet_address},
        )

    async def notify_issuer_wallet_rejected(
        self,
        user_id: UUID,
        user_email: str,
        wallet_address: str,
        display_name: str = "",
        reason: str = "",
    ) -> None:
        """Tell an issuer their wallet was rejected."""
        short = f"{wallet_address[:6]}…{wallet_address[-4:]}"
        await self.create(
            user_id=user_id,
            notif_type=ISSUER_WALLET_REJECTED,
            title="Issuer wallet rejected",
            message=f"Your wallet {short} was not approved. Contact support or submit a different wallet.",
            data={"wallet_address": wallet_address, "reason": reason},
            send_email=True,
            email_template_key="issuer_wallet_rejected",
            email_to=user_email,
            email_variables={
                "display_name": display_name,
                "wallet_address": wallet_address,
                "reason": reason,
            },
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
