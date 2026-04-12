"""OTC transfer log — tracks operator→buyer fraction token handoffs."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale


class OtcTransferLog(BaseModel):
    """Record of an ERC-1155 TransferSingle from OTC operator to buyer."""

    __tablename__ = "otc_transfer_logs"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("token_sales.id", ondelete="CASCADE"),
        index=True,
    )
    operator_address: Mapped[str] = mapped_column(String(42), index=True)
    buyer_address: Mapped[str] = mapped_column(String(42), index=True)
    fraction_id: Mapped[int] = mapped_column(SmallInteger)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18))
    tx_hash: Mapped[str] = mapped_column(String(66), unique=True, index=True)
    block_number: Mapped[int] = mapped_column(Integer)

    # Relationships
    sale: Mapped[TokenSale] = relationship(back_populates="otc_transfer_logs")

    def __repr__(self) -> str:
        return (
            f"<OtcTransferLog(id={self.id}, operator={self.operator_address}, "
            f"buyer={self.buyer_address}, amount={self.amount})>"
        )
