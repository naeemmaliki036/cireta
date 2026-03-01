"""Wallet model for user blockchain addresses."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.user import User


class Wallet(BaseModel):
    """User wallet address for blockchain transactions.

    Addresses are stored encrypted but checksummed version is indexed
    for efficient lookups.

    Attributes:
        user_id: Reference to the user
        address: Wallet address (encrypted at rest)
        address_checksum: Checksummed address for lookups (indexed)
        chain_id: Blockchain chain ID (8453 = Base mainnet)
        is_primary: Whether this is the user's primary wallet
    """

    __tablename__ = "wallets"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    address: Mapped[str] = mapped_column(
        EncryptedString(),
        init=False,
    )

    address_checksum: Mapped[str] = mapped_column(
        String(42),
        index=True,
        init=False,
    )

    chain_id: Mapped[int] = mapped_column(
        Integer,
        default=8453,  # Base mainnet
        init=False,
    )

    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        init=False,
    )

    # Relationships
    user: Mapped[User] = relationship(back_populates="wallets")

    def __repr__(self) -> str:
        return f"<Wallet(id={self.id}, address={self.address_checksum[:10]}..., chain={self.chain_id})>"
