"""SalePhase model for token sale phases."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.contribution import Contribution
    from apps.api.models.token_sale import TokenSale


class SalePhase(BaseModel):
    """Individual phase within a token sale.

    Supports multiple phases with different prices, allocations,
    and contribution limits.

    Attributes:
        sale_id: Reference to the parent sale
        phase_number: Sequential phase number
        name: Phase name (e.g., "Seed Round", "Public Sale")
        price_per_token: Token price in payment token
        allocation: Total tokens allocated for this phase
        min_contribution: Minimum contribution amount
        max_contribution: Maximum contribution amount
        start_time: Phase start time
        end_time: Phase end time
        whitelist_only: Whether phase requires whitelist
    """

    __tablename__ = "sale_phases"

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("token_sales.id", ondelete="CASCADE"),
        index=True,
    )

    phase_number: Mapped[int] = mapped_column(
        Integer,
        default=1,
    )

    name: Mapped[str] = mapped_column(String(100))

    price_per_token: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
    )

    allocation: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
    )

    min_contribution: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    max_contribution: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),  # 0 = unlimited
    )

    # Round-5: minimum top-up for repeat buyers (legacy USDC field, kept for backward compat).
    top_up_min: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("1000"),
    )

    # Whole-token buy: min/max/topup in raw token-decimal units (uint256 on
    # chain). Numeric(78,0) instead of Integer because 6-dec scaled values
    # like 100_000 * 1e6 = 1e11 overflow postgres int4 (max ~2.14e9). Matches
    # the uint256 semantics already used for price_per_token / allocation.
    min_tokens: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=0), default=Decimal("1")
    )
    max_tokens: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=0), default=Decimal("0")  # 0 = unlimited
    )
    top_up_min_tokens: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=0), default=Decimal("1")
    )

    # Round-5: per-phase allocation strategy. "fixed" = phase has its own cap;
    # "remaining" = phase can sell any unsold tokens up to totalTokenSupply.
    allocation_mode: Mapped[str] = mapped_column(
        String(20),
        default="fixed",
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    whitelist_only: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )

    # Off-chain tentative phases: False = planned/tentative (not yet on-chain),
    # True = deployed on-chain via addPhase(). Tentative phases can be freely
    # edited; deployed phases are immutable (changes require contract calls).
    deployed_on_chain: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )

    # On-chain phase index (set when deployed). Null for tentative phases.
    on_chain_phase_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # Relationships
    sale: Mapped[TokenSale] = relationship(back_populates="phases")

    contributions: Mapped[list[Contribution]] = relationship(
        back_populates="phase",
    )

    def __repr__(self) -> str:
        return f"<SalePhase(id={self.id}, name={self.name}, phase={self.phase_number})>"

    @property
    def is_active(self) -> bool:
        """Check if phase is currently active."""
        from datetime import UTC

        now = datetime.now(UTC)
        start = self.start_time
        end = self.end_time
        # Handle naive datetimes stored without tz info
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)
        return start <= now <= end
