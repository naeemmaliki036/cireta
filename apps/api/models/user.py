"""User model for Cireta RWA platform."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import KYCStatus, UserRole
from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.kyc_application import KYCApplication
    from apps.api.models.redemption_request import RedemptionRequest
    from apps.api.models.vesting_schedule import VestingSchedule
    from apps.api.models.wallet import Wallet


class User(BaseModel):
    """User model for authentication and KYC management.

    Attributes:
        email: Unique email address
        hashed_password: Bcrypt hashed password
        role: User role (investor, issuer, admin)
        kyc_status: Current KYC verification status
        kyc_level: KYC verification level (0-3)
        onchain_id: ONCHAINID identity contract address
        sumsub_applicant_id: Sumsub applicant ID (encrypted)
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        init=False,
    )

    hashed_password: Mapped[str] = mapped_column(String(255), init=False)

    role: Mapped[UserRole] = mapped_column(
        String(20),
        default=UserRole.INVESTOR,
        init=False,
    )

    kyc_status: Mapped[KYCStatus] = mapped_column(
        String(20),
        default=KYCStatus.NONE,
        init=False,
    )

    kyc_level: Mapped[int] = mapped_column(
        Integer,
        default=0,
        init=False,
    )

    onchain_id: Mapped[str | None] = mapped_column(
        String(42),
        nullable=True,
        default=None,
        init=False,
    )

    sumsub_applicant_id: Mapped[str | None] = mapped_column(
        EncryptedString(),
        nullable=True,
        default=None,
        init=False,
    )

    # Relationships
    kyc_applications: Mapped[list[KYCApplication]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    wallets: Mapped[list[Wallet]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    issuer: Mapped[Issuer | None] = relationship(
        back_populates="user",
        uselist=False,
    )

    contributions: Mapped[list[Contribution]] = relationship(
        back_populates="user",
    )

    vesting_schedules: Mapped[list[VestingSchedule]] = relationship(
        back_populates="user",
    )

    redemption_requests: Mapped[list[RedemptionRequest]] = relationship(
        back_populates="user",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role.value})>"

    @property
    def can_invest(self) -> bool:
        """Check if user has sufficient KYC level to invest."""
        return self.kyc_level >= 2 and self.kyc_status == KYCStatus.APPROVED

    @property
    def can_initiate_kyc(self) -> bool:
        """Check if user has sufficient KYC level to initiate KYC."""
        return self.kyc_level >= 1 or self.kyc_status == KYCStatus.NONE
