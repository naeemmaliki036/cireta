"""SaleFAQ model for sale frequently asked questions."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale


class SaleFAQ(BaseModel):
    """FAQ entry associated with a token sale."""

    __tablename__ = "sale_faqs"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    sale: Mapped[TokenSale] = relationship(back_populates="faqs")
