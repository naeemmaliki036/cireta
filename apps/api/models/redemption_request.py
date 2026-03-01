"""RedemptionRequest model for commodity token redemptions."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import FulfillmentMethod, RedemptionStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token import Token
    from apps.api.models.user import User


class RedemptionRequest(BaseModel):
    """Request to redeem commodity tokens for physical delivery or cash.

    Handles the redemption process for commodity-backed tokens.

    Attributes:
        token_id: Reference to the redeemed token
        user_id: Reference to the requesting user
        amount: Amount of tokens to redeem
        fulfillment_method: Physical delivery or cash settlement
        status: Redemption request status
        tx_hash: Token burn transaction hash
        fulfilled_at: When redemption was fulfilled
        notes: Additional notes or tracking info
    """

    __tablename__ = "redemption_requests"

    token_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tokens.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        init=False,
    )

    fulfillment_method: Mapped[FulfillmentMethod] = mapped_column(
        String(20),
        default=FulfillmentMethod.CASH,
        init=False,
    )

    status: Mapped[RedemptionStatus] = mapped_column(
        String(20),
        default=RedemptionStatus.PENDING,
        init=False,
    )

    tx_hash: Mapped[str | None] = mapped_column(
        String(66),
        nullable=True,
        index=True,
        init=False,
    )

    fulfilled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        init=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        init=False,
    )

    # Relationships
    token: Mapped[Token] = relationship(back_populates="redemption_requests")

    user: Mapped[User] = relationship(back_populates="redemption_requests")

    def __repr__(self) -> str:
        return f"<RedemptionRequest(id={self.id}, amount={self.amount}, status={self.status.value})>"

    @property
    def is_pending(self) -> bool:
        """Check if request is still pending."""
        return self.status == RedemptionStatus.PENDING

    @property
    def is_fulfilled(self) -> bool:
        """Check if request has been fulfilled."""
        return self.status == RedemptionStatus.FULFILLED
