"""User model for Cireta RWA platform."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import KYCStatus, UserRole
from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.kyc_application import KYCApplication
    from apps.api.models.notification import Notification
    from apps.api.models.notification_preferences import NotificationPreferences
    from apps.api.models.redemption_request import RedemptionRequest
    from apps.api.models.vesting_schedule import VestingSchedule
    from apps.api.models.wallet import Wallet


class User(BaseModel):
    """User model for authentication and KYC management."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)

    role: Mapped[UserRole] = mapped_column(String(20), default=UserRole.INVESTOR)

    # Email verification
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # KYC
    kyc_status: Mapped[KYCStatus] = mapped_column(String(20), default=KYCStatus.NONE)
    kyc_level: Mapped[int] = mapped_column(Integer, default=0)
    kyc_provider: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    kyc_external_id: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    kyc_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    kyc_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True, default=None)
    investor_type: Mapped[str] = mapped_column(String(20), default="individual")

    # On-chain identity
    onchain_id: Mapped[str | None] = mapped_column(String(42), nullable=True, default=None)
    sumsub_applicant_id: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True, default=None)

    # Password reset
    password_reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    password_reset_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # Brute force protection
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    # Relationships
    kyc_applications: Mapped[list[KYCApplication]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wallets: Mapped[list[Wallet]] = relationship(back_populates="user", cascade="all, delete-orphan")
    issuer: Mapped[Issuer | None] = relationship(back_populates="user", uselist=False)
    contributions: Mapped[list[Contribution]] = relationship(back_populates="user")
    vesting_schedules: Mapped[list[VestingSchedule]] = relationship(back_populates="user")
    redemption_requests: Mapped[list[RedemptionRequest]] = relationship(back_populates="user")
    notifications: Mapped[list[Notification]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notification_preferences: Mapped[NotificationPreferences | None] = relationship("NotificationPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"

    @property
    def can_invest(self) -> bool:
        """Check if user has sufficient KYC level to invest."""
        return self.kyc_level >= 2 and self.kyc_status == KYCStatus.APPROVED

    @property
    def can_initiate_kyc(self) -> bool:
        """Check if user can initiate KYC."""
        return self.kyc_level >= 1 or self.kyc_status == KYCStatus.NONE

    @property
    def is_locked(self) -> bool:
        """Check if account is currently locked."""
        if self.locked_until is None:
            return False
        now = datetime.now(UTC)
        locked = self.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=UTC)
        return now < locked
