"""DividendDistribution model for tracking USDC dividend epochs."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class DividendDistribution(BaseModel):
    """Records a dividend deposit epoch for a token."""

    __tablename__ = "dividend_distributions"

    token_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tokens.id", ondelete="CASCADE"), index=True
    )
    epoch_index: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(36, 6))
    total_supply_snapshot: Mapped[Decimal] = mapped_column(Numeric(36, 18), default=Decimal("0"))
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)

    def __repr__(self) -> str:
        return f"<DividendDistribution(id={self.id}, token_id={self.token_id}, epoch={self.epoch_index})>"
