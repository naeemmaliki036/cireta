"""Wallet audit trail — immutable log of wallet link/unlink events."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString


class WalletAuditLog(BaseModel):
    """Append-only audit trail for wallet link/unlink events."""

    __tablename__ = "wallet_audit_logs"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(20), index=True)  # "linked" | "unlinked"
    address: Mapped[str] = mapped_column(String(42))
    address_checksum: Mapped[str] = mapped_column(String(42), index=True)
    chain_id: Mapped[int] = mapped_column(Integer, default=8453)
    was_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    was_safe: Mapped[bool] = mapped_column(Boolean, default=False)
    was_registered_on_chain: Mapped[bool] = mapped_column(Boolean, default=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    link_signature: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    link_nonce: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unlinked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
