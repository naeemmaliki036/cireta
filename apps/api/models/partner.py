"""Strategic partners displayed on the landing page (admin-managed)."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class Partner(BaseModel):
    """Partner logo and link shown on the landing page."""

    __tablename__ = "partners"

    name: Mapped[str] = mapped_column(String(200))
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    def __repr__(self) -> str:
        return f"<Partner(name={self.name})>"
