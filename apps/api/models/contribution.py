"""Contribution model for token sale investments."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import ContributionStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.sale_phase import SalePhase
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.user import User


class Contribution(BaseModel):
    """User contribution to a token sale."""

    __tablename__ = "contributions"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    phase_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("sale_phases.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18))
    tokens_allocated: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18))
    tx_hash: Mapped[str] = mapped_column(String(66), unique=True, index=True)
    status: Mapped[ContributionStatus] = mapped_column(
        String(20), default=ContributionStatus.PENDING
    )
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # OTC fields
    is_otc: Mapped[bool] = mapped_column(Boolean, default=False)
    otc_reference: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    wallet_address: Mapped[str | None] = mapped_column(String(42), nullable=True, default=None)
    phase_index: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    user: Mapped[User] = relationship(back_populates="contributions")
    sale: Mapped[TokenSale] = relationship(back_populates="contributions")
    phase: Mapped[SalePhase] = relationship(back_populates="contributions")

    def __repr__(self) -> str:
        return f"<Contribution(id={self.id}, amount={self.amount}, status={self.status})>"

    @property
    def is_claimable(self) -> bool:
        return self.status == ContributionStatus.CONFIRMED
