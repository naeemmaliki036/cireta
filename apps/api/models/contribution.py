"""Contribution model for token sale investments."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import ContributionStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.sale_phase import SalePhase
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.user import User


class Contribution(BaseModel):
    """User contribution to a token sale.

    Tracks the investment amount, allocated tokens, and claim status.

    Attributes:
        user_id: Reference to the contributing user
        sale_id: Reference to the token sale
        phase_id: Reference to the sale phase
        amount: Contribution amount in payment token
        tokens_allocated: Number of tokens allocated
        tx_hash: Blockchain transaction hash
        status: Contribution status
        claimed_at: When tokens were claimed
    """

    __tablename__ = "contributions"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("token_sales.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    phase_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sale_phases.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        init=False,
    )

    tokens_allocated: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        init=False,
    )

    tx_hash: Mapped[str] = mapped_column(
        String(66),
        unique=True,
        index=True,
        init=False,
    )

    status: Mapped[ContributionStatus] = mapped_column(
        String(20),
        default=ContributionStatus.PENDING,
        init=False,
    )

    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        init=False,
    )

    # Relationships
    user: Mapped[User] = relationship(back_populates="contributions")

    sale: Mapped[TokenSale] = relationship(back_populates="contributions")

    phase: Mapped[SalePhase] = relationship(back_populates="contributions")

    def __repr__(self) -> str:
        return f"<Contribution(id={self.id}, amount={self.amount}, status={self.status.value})>"

    @property
    def is_claimable(self) -> bool:
        """Check if contribution is confirmed and not yet claimed."""
        return self.status == ContributionStatus.CONFIRMED
