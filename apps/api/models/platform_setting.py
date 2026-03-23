"""PlatformSetting model — persisted key-value settings."""

from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class PlatformSetting(BaseModel):
    """Key-value platform settings stored in the database.

    Replaces the previous file-backed JSON approach so that settings
    survive container restarts and work across horizontally-scaled replicas.
    """

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text, default="")

    def __repr__(self) -> str:
        return f"<PlatformSetting(key={self.key}, value={self.value})>"
