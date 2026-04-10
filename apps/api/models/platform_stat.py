"""Platform statistics displayed on the landing page (admin-editable)."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class PlatformStat(BaseModel):
    """Key-value statistics shown on the landing page hero section."""

    __tablename__ = "platform_stats"

    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    value: Mapped[str] = mapped_column(String(100))
    label: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    def __repr__(self) -> str:
        return f"<PlatformStat(key={self.key}, value={self.value})>"
