"""TokenSale model for token sale campaigns."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import SaleStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.sale_phase import SalePhase
    from apps.api.models.token import Token


class TokenSale(BaseModel):
    """Token sale campaign for an ERC-3643 token.

    Manages the fundraising process with multiple phases,
    soft/hard caps, and USDC payment processing.

    Attributes:
        token_id: Reference to the token being sold
        issuer_id: Reference to the issuer
        payment_token: Address of payment token (USDC)
        soft_cap: Minimum funding goal
        hard_cap: Maximum funding cap
        status: Current sale status
        total_raised: Total amount raised so far
    """

    __tablename__ = "token_sales"

    token_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tokens.id", ondelete="CASCADE"),
        index=True,
    )

    issuer_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("issuers.id", ondelete="CASCADE"),
        index=True,
    )

    payment_token: Mapped[str] = mapped_column(
        String(42),
        default="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC on Base
    )

    soft_cap: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    hard_cap: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    status: Mapped[SaleStatus] = mapped_column(
        String(20),
        default=SaleStatus.DRAFT,
    )

    total_raised: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    # Relationships
    token: Mapped[Token] = relationship(back_populates="token_sales")

    issuer: Mapped[Issuer] = relationship(back_populates="token_sales")

    phases: Mapped[list[SalePhase]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="SalePhase.phase_number",
    )

    contributions: Mapped[list[Contribution]] = relationship(
        back_populates="sale",
    )

    def __repr__(self) -> str:
        return f"<TokenSale(id={self.id}, token_id={self.token_id}, status={self.status.value})>"

    @property
    def is_active(self) -> bool:
        """Check if sale is currently active."""
        return self.status == SaleStatus.ACTIVE

    @property
    def soft_cap_reached(self) -> bool:
        """Check if soft cap has been reached."""
        return self.total_raised >= self.soft_cap

    @property
    def hard_cap_reached(self) -> bool:
        """Check if hard cap has been reached."""
        return self.total_raised >= self.hard_cap

    @property
    def remaining_capacity(self) -> Decimal:
        """Calculate remaining capacity until hard cap."""
        return max(Decimal("0"), self.hard_cap - self.total_raised)
