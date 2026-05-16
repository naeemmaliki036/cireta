"""ShippingAddress — investor's saved physical delivery addresses.

PII fields (recipient name, lines, city, region, postal code, phone,
label, notes) are stored encrypted at rest. `country` (ISO 3166-1
alpha-3) is plain so the cross-country mismatch check can run as a
simple column comparison without round-tripping through encryption.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.user import User


class ShippingAddress(BaseModel):
    """A user's saved physical delivery address."""

    __tablename__ = "shipping_addresses"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    label: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    recipient_name: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    line1: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    line2: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    city: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    region: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    postal_code: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    country: Mapped[str] = mapped_column(String(3), nullable=False)  # alpha-3, plain
    phone: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    notes: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User] = relationship(back_populates="shipping_addresses")

    def __repr__(self) -> str:
        return (
            f"<ShippingAddress(id={self.id}, user_id={self.user_id}, "
            f"country={self.country}, default={self.is_default})>"
        )
