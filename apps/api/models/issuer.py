"""Issuer model for token issuers on the platform."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import IssuerStatus
from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.token import Token
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.user import User


class Issuer(BaseModel):
    """Token issuer on the Cireta platform.

    Issuers are entities that can create and manage security tokens.

    Attributes:
        user_id: Reference to the user account
        name: Display name of the issuer
        slug: URL-friendly unique identifier
        wallet_address: Issuer's wallet address (encrypted)
        fee_bps: Platform fee in basis points (default 200 = 2%)
        status: Approval status
        legal_entity_name: Legal name of the issuing entity
        jurisdiction: Legal jurisdiction
    """

    __tablename__ = "issuers"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255))

    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
    )

    wallet_address: Mapped[str | None] = mapped_column(
        EncryptedString(),
        nullable=True,
    )

    fee_bps: Mapped[int] = mapped_column(
        Integer,
        default=200,  # 2% default
    )

    status: Mapped[IssuerStatus] = mapped_column(
        String(20),
        default=IssuerStatus.PENDING,
    )

    legal_entity_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    jurisdiction: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # Relationships
    user: Mapped[User] = relationship(back_populates="issuer")

    tokens: Mapped[list[Token]] = relationship(
        back_populates="issuer",
        cascade="all, delete-orphan",
    )

    token_sales: Mapped[list[TokenSale]] = relationship(
        back_populates="issuer",
    )

    def __repr__(self) -> str:
        return f"<Issuer(id={self.id}, name={self.name}, status={self.status.value})>"

    @property
    def is_active(self) -> bool:
        """Check if issuer is approved and active."""
        return self.status == IssuerStatus.ACTIVE
