"""Leadership team members displayed on the landing page (admin-managed)."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class TeamMember(BaseModel):
    """Team member profile shown on the landing page."""

    __tablename__ = "team_members"

    name: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(200))
    bio: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    def __repr__(self) -> str:
        return f"<TeamMember(name={self.name}, title={self.title})>"
