"""TokenSale model for token sale campaigns."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import SaleMode, SaleStatus, SaleStructure
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.sale_document import SaleDocument
    from apps.api.models.sale_faq import SaleFAQ
    from apps.api.models.sale_image import SaleImage
    from apps.api.models.sale_phase import SalePhase
    from apps.api.models.sale_team_member import SaleTeamMember
    from apps.api.models.token import Token


class TokenSale(BaseModel):
    """Token sale campaign for an ERC-3643 token."""

    __tablename__ = "token_sales"

    # Token is optional — allows "coming soon" sales without a deployed token
    token_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tokens.id", ondelete="SET NULL"), index=True, nullable=True
    )
    issuer_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("issuers.id", ondelete="RESTRICT"), index=True
    )

    # Sale content fields
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    full_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    banner_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_coming_soon: Mapped[bool] = mapped_column(Boolean, default=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=False)

    # OTC & Bank Transfer
    otc_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    otc_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    otc_token_address: Mapped[str | None] = mapped_column(String(42), nullable=True, default=None)

    # Social links
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    twitter_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    facebook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    telegram_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    discord_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Vesting configuration
    cliff_duration_days: Mapped[int] = mapped_column(Integer, default=0)
    vesting_duration_days: Mapped[int] = mapped_column(Integer, default=365)

    payment_token: Mapped[str] = mapped_column(
        String(42), default="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    )
    soft_cap: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18), default=Decimal("0"))
    hard_cap: Mapped[Decimal] = mapped_column(Numeric(precision=78, scale=18), default=Decimal("0"))
    status: Mapped[SaleStatus] = mapped_column(String(30), default=SaleStatus.DRAFT)
    total_raised: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18), default=Decimal("0")
    )

    # Spec-required fields
    fee_cap_usdc: Mapped[Decimal | None] = mapped_column(
        Numeric(36, 6), nullable=True, default=None
    )
    total_raised_on_platform: Mapped[Decimal] = mapped_column(Numeric(36, 6), default=Decimal("0"))
    platform_fee_collected: Mapped[Decimal] = mapped_column(Numeric(36, 6), default=Decimal("0"))
    total_withdrawn: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18), default=Decimal("0")
    )
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True, default=None)
    finalized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    platform_fee_bps: Mapped[int] = mapped_column(Integer, default=250)
    sale_mode: Mapped[SaleMode] = mapped_column(String(20), default=SaleMode.VESTED)
    sale_structure: Mapped[SaleStructure] = mapped_column(String(20), default=SaleStructure.PHASE_ALLOCATED)
    vault_address: Mapped[str | None] = mapped_column(String(42), nullable=True, default=None)
    fraction_token_address: Mapped[str | None] = mapped_column(
        String(42), nullable=True, default=None
    )

    # Relationships
    token: Mapped[Token | None] = relationship(back_populates="token_sales")
    issuer: Mapped[Issuer] = relationship(back_populates="token_sales")
    phases: Mapped[list[SalePhase]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SalePhase.phase_number"
    )
    contributions: Mapped[list[Contribution]] = relationship(back_populates="sale")
    team_members: Mapped[list[SaleTeamMember]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleTeamMember.sort_order"
    )
    faqs: Mapped[list[SaleFAQ]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleFAQ.sort_order"
    )
    images: Mapped[list[SaleImage]] = relationship(
        back_populates="sale", cascade="all, delete-orphan", order_by="SaleImage.sort_order"
    )
    documents: Mapped[list[SaleDocument]] = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<TokenSale(id={self.id}, token_id={self.token_id}, status={self.status})>"

    @property
    def is_active(self) -> bool:
        return self.status == SaleStatus.ACTIVE

    @property
    def soft_cap_reached(self) -> bool:
        return self.total_raised >= self.soft_cap

    @property
    def hard_cap_reached(self) -> bool:
        return self.total_raised >= self.hard_cap

    @property
    def remaining_capacity(self) -> Decimal:
        return max(Decimal("0"), self.hard_cap - self.total_raised)
