"""WebhookEvent model for webhook retry and dead letter queue."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class WebhookEvent(BaseModel):
    """Stores incoming webhook payloads for reliable processing with retry.

    Webhooks are stored first, then processed async. Failed webhooks are
    retried up to 3 times with exponential backoff. After max retries,
    status is set to 'failed' (dead letter queue).
    """

    __tablename__ = "webhook_events"

    provider: Mapped[str] = mapped_column(String(50), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    def __repr__(self) -> str:
        return f"<WebhookEvent(id={self.id}, provider={self.provider}, status={self.status})>"
