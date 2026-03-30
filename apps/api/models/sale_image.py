"""SaleImage model for sale image gallery."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale


class SaleImage(BaseModel):
    """Image associated with a token sale gallery."""

    __tablename__ = "sale_images"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(500))
    caption: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_banner: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    media_type: Mapped[str] = mapped_column(String(10), default="image")  # "image" or "video"
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # YouTube/Vimeo embed URL

    sale: Mapped[TokenSale] = relationship(back_populates="images")
