"""RedemptionRequest model for commodity token redemptions."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import FulfillmentMethod, RedemptionStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token import Token
    from apps.api.models.user import User


class RedemptionRequest(BaseModel):
    """Request to redeem commodity tokens for physical delivery or cash."""

    __tablename__ = "redemption_requests"

    token_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tokens.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18))
    fulfillment_method: Mapped[FulfillmentMethod] = mapped_column(
        String(20), default=FulfillmentMethod.CASH
    )
    status: Mapped[RedemptionStatus] = mapped_column(String(20), default=RedemptionStatus.PENDING)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True, index=True)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_details: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Delivery details
    delivery_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # On-chain id emitted by RedemptionManager.RedemptionRequested(id, ...).
    # Joined back to the row by the indexer.
    onchain_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    token: Mapped[Token] = relationship(back_populates="redemption_requests")
    user: Mapped[User] = relationship(back_populates="redemption_requests")

    def __repr__(self) -> str:
        return f"<RedemptionRequest(id={self.id}, amount={self.amount}, status={self.status})>"

    @property
    def is_pending(self) -> bool:
        return self.status == RedemptionStatus.PENDING

    @property
    def is_fulfilled(self) -> bool:
        return self.status == RedemptionStatus.FULFILLED
