"""Issuer email whitelist model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.models.enums import IssuerType
from packages.common.models.base import BaseModel


class IssuerWhitelist(BaseModel):
    """Pre-approved emails that can register as issuers.

    Attributes:
        email: Whitelisted email address
        issuer_type: individual or corporate (determines KYC vs KYB)
        invited_by: Admin user who added this entry
        registered_at: When the issuer actually registered (null if pending)
    """

    __tablename__ = "issuer_whitelist"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    issuer_type: Mapped[IssuerType] = mapped_column(
        String(20),
        default=IssuerType.INDIVIDUAL,
    )

    invited_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    kyc_required: Mapped[bool] = mapped_column(Boolean, default=True)

    registered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
