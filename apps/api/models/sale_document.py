"""SaleDocument model for sale-level documents."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale


class SaleDocument(BaseModel):
    """Document associated with a token sale."""

    __tablename__ = "sale_documents"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    doc_type: Mapped[str] = mapped_column(String(50), default="other")
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    ipfs_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)

    sale: Mapped[TokenSale] = relationship(back_populates="documents")
