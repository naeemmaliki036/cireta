"""AuditLog model for compliance tracking.

CRITICAL: This table is append-only. NEVER update or delete rows.
All compliance actions must be logged here.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString


class AuditLog(BaseModel):
    """Immutable audit log for compliance actions.

    This table is APPEND-ONLY. No updates or deletes are permitted.
    All compliance-related actions (freeze, unfreeze, forced-transfer,
    recover, pause, unpause) MUST be logged here.

    Attributes:
        actor_id: User who performed the action
        action: Action type (freeze, unfreeze, forced_transfer, etc.)
        target_type: Type of target entity (user, token, wallet, etc.)
        target_id: ID of the target entity
        payload: Additional action details as JSON
        ip_address: IP address of the actor
    """

    __tablename__ = "audit_logs"

    actor_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )

    target_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )

    target_id: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )

    payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    ip_address: Mapped[str | None] = mapped_column(
        EncryptedString(),  # IPv6 max length — encrypted for GDPR
        nullable=True,
    )

    reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, target={self.target_type}/{self.target_id})>"

    # NOTE: This model intentionally does not have update methods.
    # All records are append-only for compliance purposes.
