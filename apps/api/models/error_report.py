"""ErrorReport model — user-submitted reports of failed transactions / errors."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.user import User


class ErrorReport(BaseModel):
    """User-submitted error report.

    Captures failed transactions / API errors so platform admins can
    investigate. The report is fired by a 'Report' button from the
    buyer/issuer UI when a tx reverts or any user-facing operation
    fails. Stored both for admin triage and emailed to the configured
    support address (platform_settings.support_email).
    """

    __tablename__ = "error_reports"

    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        index=True, nullable=True,
    )
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wallet_address: Mapped[str | None] = mapped_column(String(42), nullable=True)

    # On-chain context — NULL when the failure happened before any tx submission
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    function_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    chain_id: Mapped[int | None] = mapped_column(nullable=True)

    # Error context
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Browsing context
    page_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # User free-text note (optional)
    additional_details: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Email send result — recipient + status (sent / dev_logged / error / skipped)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return (
            f"<ErrorReport(id={self.id}, function={self.function_name}, "
            f"tx={self.tx_hash})>"
        )
