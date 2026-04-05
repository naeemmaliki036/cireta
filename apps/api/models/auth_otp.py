"""OTP model for passwordless authentication."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class AuthOTP(BaseModel):
    """One-time password for email-based authentication."""

    __tablename__ = "auth_otps"

    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    code: Mapped[str] = mapped_column(String(6))
    purpose: Mapped[str] = mapped_column(String(20))  # login, register, verify_email
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)

    def __repr__(self) -> str:
        return f"<AuthOTP(email={self.email}, purpose={self.purpose})>"
