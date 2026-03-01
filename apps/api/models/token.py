"""Token model for ERC-3643 security tokens."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import AssetType
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.issuer import Issuer
    from apps.api.models.redemption_request import RedemptionRequest
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.vesting_schedule import VestingSchedule


class Token(BaseModel):
    """ERC-3643 security token on Base L2.

    Represents a tokenized real-world asset (commodity or futures).

    Attributes:
        issuer_id: Reference to the token issuer
        name: Token name
        symbol: Token symbol
        asset_type: Type of underlying asset
        contract_address: Deployed contract address
        chain_id: Blockchain chain ID
        total_supply: Total token supply
        decimals: Token decimals
        ipfs_docs_hash: IPFS hash for legal documents
        chainlink_por_feed: Chainlink Proof of Reserve feed address
        is_paused: Whether token transfers are paused
    """

    __tablename__ = "tokens"

    issuer_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("issuers.id", ondelete="CASCADE"),
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255))

    symbol: Mapped[str] = mapped_column(
        String(20),
        index=True,
    )

    asset_type: Mapped[AssetType] = mapped_column(
        String(20),
        default=AssetType.COMMODITY,
    )

    contract_address: Mapped[str | None] = mapped_column(
        String(42),
        nullable=True,
        index=True,
    )

    chain_id: Mapped[int] = mapped_column(
        Integer,
        default=8453,  # Base mainnet
    )

    total_supply: Mapped[Decimal] = mapped_column(
        Numeric(precision=78, scale=18),
        default=Decimal("0"),
    )

    decimals: Mapped[int] = mapped_column(
        Integer,
        default=18,
    )

    ipfs_docs_hash: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    chainlink_por_feed: Mapped[str | None] = mapped_column(
        String(42),
        nullable=True,
    )

    slug: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        unique=True,
        index=True,
    )

    description: Mapped[str | None] = mapped_column(
        String(2000),
        nullable=True,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    is_paused: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )

    # Relationships
    issuer: Mapped[Issuer] = relationship(back_populates="tokens")

    token_sales: Mapped[list[TokenSale]] = relationship(
        back_populates="token",
        cascade="all, delete-orphan",
    )

    vesting_schedules: Mapped[list[VestingSchedule]] = relationship(
        back_populates="token",
    )

    redemption_requests: Mapped[list[RedemptionRequest]] = relationship(
        back_populates="token",
    )

    def __repr__(self) -> str:
        return f"<Token(id={self.id}, symbol={self.symbol}, type={self.asset_type.value})>"

    @property
    def is_deployed(self) -> bool:
        """Check if token contract is deployed."""
        return self.contract_address is not None