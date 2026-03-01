"""Wallet model for user blockchain addresses."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.user import User


class Wallet(BaseModel):
    """User wallet address for blockchain transactions."""

    __tablename__ = "wallets"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    address: Mapped[str] = mapped_column(EncryptedString())
    address_checksum: Mapped[str] = mapped_column(String(42), index=True)
    chain_id: Mapped[int] = mapped_column(Integer, default=8453)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_safe: Mapped[bool] = mapped_column(Boolean, default=False)
    registered_on_chain: Mapped[bool] = mapped_column(Boolean, default=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="wallets")

    def __repr__(self) -> str:
        return f"<Wallet(id={self.id}, address={self.address_checksum[:10]}..., chain={self.chain_id})>"
