"""VestingSchedule model for token vesting."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token import Token
    from apps.api.models.user import User


class VestingSchedule(BaseModel):
    """Token vesting schedule for an investor.

    Manages time-locked token releases with cliff and linear vesting.

    Attributes:
        token_id: Reference to the vested token
        user_id: Reference to the beneficiary
        total_amount: Total tokens in vesting
        claimed_amount: Tokens already claimed
        cliff_end: When cliff period ends
        vesting_end: When vesting fully completes
        last_claim_at: Last claim timestamp
    """

    __tablename__ = "vesting_schedules"

    token_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tokens.id", ondelete="CASCADE"),
        index=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
    )

    claimed_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    cliff_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    vesting_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
    )

    last_claim_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    is_revocable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    token: Mapped[Token] = relationship(back_populates="vesting_schedules")

    user: Mapped[User] = relationship(back_populates="vesting_schedules")

    def __repr__(self) -> str:
        return f"<VestingSchedule(id={self.id}, total={self.total_amount}, claimed={self.claimed_amount})>"

    @property
    def cliff_passed(self) -> bool:
        """Check if cliff period has passed."""
        cliff = self.cliff_end
        if cliff.tzinfo is None:
            cliff = cliff.replace(tzinfo=UTC)
        return datetime.now(UTC) >= cliff

    @property
    def remaining_amount(self) -> Decimal:
        """Calculate remaining unvested tokens."""
        return self.total_amount - self.claimed_amount

    @property
    def claimable_amount(self) -> Decimal:
        """Calculate currently claimable tokens based on vesting progress."""
        if not self.cliff_passed:
            return Decimal("0")

        now = datetime.now(UTC)
        vesting_end = self.vesting_end
        cliff_end = self.cliff_end
        if vesting_end.tzinfo is None:
            vesting_end = vesting_end.replace(tzinfo=UTC)
        if cliff_end.tzinfo is None:
            cliff_end = cliff_end.replace(tzinfo=UTC)
        if now >= vesting_end:
            return self.remaining_amount

        # Linear vesting between cliff and end
        total_vesting_seconds = (vesting_end - cliff_end).total_seconds()
        elapsed_seconds = (now - cliff_end).total_seconds()

        if total_vesting_seconds <= 0:
            return self.remaining_amount

        vesting_ratio = Decimal(str(elapsed_seconds)) / Decimal(str(total_vesting_seconds))
        vested_amount = self.total_amount * vesting_ratio
        return max(Decimal("0"), vested_amount - self.claimed_amount)
