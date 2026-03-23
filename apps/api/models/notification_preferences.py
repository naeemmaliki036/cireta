"""Notification preferences model."""

from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel


class NotificationPreferences(BaseModel):
    """Per-user notification preferences stored in DB."""

    __tablename__ = "notification_preferences"

    user_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Investment updates
    email_investment_updates: Mapped[bool] = mapped_column(Boolean, default=True)
    inapp_investment_updates: Mapped[bool] = mapped_column(Boolean, default=True)

    # Sale announcements
    email_sale_announcements: Mapped[bool] = mapped_column(Boolean, default=True)
    inapp_sale_announcements: Mapped[bool] = mapped_column(Boolean, default=True)

    # KYC status
    email_kyc_status: Mapped[bool] = mapped_column(Boolean, default=True)
    inapp_kyc_status: Mapped[bool] = mapped_column(Boolean, default=True)

    # Dividends
    email_dividends: Mapped[bool] = mapped_column(Boolean, default=True)
    inapp_dividends: Mapped[bool] = mapped_column(Boolean, default=True)

    # Security (always on — cannot disable)
    email_security: Mapped[bool] = mapped_column(Boolean, default=True)
    inapp_security: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship("User", back_populates="notification_preferences")  # type: ignore[name-defined]  # noqa: F821
