"""SaleTeamMember model for sale team information."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale


class SaleTeamMember(BaseModel):
    """Team member associated with a token sale."""

    __tablename__ = "sale_team_members"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    sale: Mapped[TokenSale] = relationship(back_populates="team_members")
