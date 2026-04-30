"""ErrorReportService — persists user-submitted error reports + emails support."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.error_report import ErrorReport
from apps.api.models.platform_setting import PlatformSetting
from apps.api.services.email_service import EmailService

logger = logging.getLogger(__name__)

# Hard-coded fallback if platform_settings.support_email row is missing or
# was cleared by an admin. Migration 046 seeds the row with
# naeem+support@vanarchain.com — admin can update via /platform/settings.
DEFAULT_SUPPORT_EMAIL = "support@cireta.com"

_BLOCK_EXPLORERS: dict[int, str] = {
    1: "https://etherscan.io",
    8453: "https://basescan.org",
    84532: "https://sepolia.basescan.org",
    11155111: "https://sepolia.etherscan.io",
    137: "https://polygonscan.com",
}


def _explorer_tx_url(chain_id: int | None, tx_hash: str | None) -> str:
    if not (chain_id and tx_hash):
        return ""
    base = _BLOCK_EXPLORERS.get(int(chain_id), "")
    return f"{base}/tx/{tx_hash}" if base else ""


class ErrorReportService:
    """Capture and notify on user-submitted error reports."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _resolve_support_email(self) -> str:
        result = await self.db.execute(
            select(PlatformSetting).where(PlatformSetting.key == "support_email")
        )
        setting = result.scalar_one_or_none()
        value = (setting.value or "").strip() if setting else ""
        return value or DEFAULT_SUPPORT_EMAIL

    async def create_and_notify(
        self,
        *,
        user_id: UUID | None,
        user_email: str | None,
        wallet_address: str | None,
        tx_hash: str | None,
        contract_address: str | None,
        function_name: str | None,
        chain_id: int | None,
        error_code: str | None,
        error_message: str | None,
        page_url: str | None,
        user_agent: str | None,
        additional_details: str | None,
    ) -> ErrorReport:
        recipient = await self._resolve_support_email()

        report = ErrorReport()
        report.user_id = user_id
        report.user_email = user_email
        report.wallet_address = wallet_address
        report.tx_hash = tx_hash
        report.contract_address = contract_address
        report.function_name = function_name
        report.chain_id = chain_id
        report.error_code = error_code
        report.error_message = error_message
        report.page_url = page_url
        report.user_agent = user_agent
        report.additional_details = additional_details
        report.recipient_email = recipient
        report.email_status = "pending"

        self.db.add(report)
        await self.db.flush()

        # Send the email. Failure here must not lose the report — capture
        # the status on the row and commit either way.
        email_status = "skipped"
        try:
            email_svc = EmailService(self.db)
            variables: dict[str, Any] = {
                "user_email": user_email or "(anonymous)",
                "wallet_address": wallet_address or "—",
                "page_url": page_url or "—",
                "function_name": function_name or "—",
                "tx_hash": tx_hash or "(no tx — pre-submission failure)",
                "tx_url": _explorer_tx_url(chain_id, tx_hash) or "—",
                "contract_address": contract_address or "—",
                "error_code": error_code or "—",
                "error_message": error_message or "—",
                "additional_details": additional_details or "(no notes from user)",
                "user_agent": user_agent or "—",
            }
            send_result = await email_svc.send("user_error_report", recipient, variables)
            email_status = send_result.get("status", "error")
        except Exception:
            logger.exception("Error-report email send failed")
            email_status = "error"

        report.email_status = email_status
        await self.db.commit()
        await self.db.refresh(report)
        return report
