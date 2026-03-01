"""KYC Application model for Sumsub integration."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedJSON, EncryptedString

if TYPE_CHECKING:
    from apps.api.models.user import User


class KYCApplication(BaseModel):
    """KYC application record from Sumsub verification.

    Attributes:
        user_id: Reference to the user
        sumsub_review_id: Sumsub review identifier (encrypted)
        result_payload: Full Sumsub result payload (encrypted)
        status: Application status from Sumsub
        submitted_at: When the application was submitted
        reviewed_at: When the review was completed
    """

    __tablename__ = "kyc_applications"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        init=False,
    )

    sumsub_review_id: Mapped[str | None] = mapped_column(
        EncryptedString(),
        nullable=True,
        init=False,
    )

    result_payload: Mapped[dict[str, Any] | None] = mapped_column(
        EncryptedJSON(),
        nullable=True,
        init=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        init=False,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        init=False,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        init=False,
    )

    # Relationships
    user: Mapped[User] = relationship(back_populates="kyc_applications")

    def __repr__(self) -> str:
        return f"<KYCApplication(id={self.id}, user_id={self.user_id}, status={self.status})>"
