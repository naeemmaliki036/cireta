"""Token recovery audit log model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import RecoveryTokenType
from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.issuer import Issuer
    from apps.api.models.token import Token
    from apps.api.models.user import User


class RecoveryLog(BaseModel):
    """Immutable audit trail for every token recovery action.

    Supports both ERC-3643 project token recovery and ERC-1155 fraction
    token recovery (both ID=1 and ID=2). Cross-user transfers allowed
    (from_user_id != to_user_id).
    """

    __tablename__ = "recovery_logs"

    token_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tokens.id"), nullable=False
    )
    issuer_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issuers.id"), nullable=False
    )

    # Cross-user recovery: source and destination can be different users.
    from_user_id: Mapped[PGUUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    to_user_id: Mapped[PGUUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Keep legacy column for backward compat with existing rows.
    investor_user_id: Mapped[PGUUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    lost_wallet: Mapped[str] = mapped_column(String(42), nullable=False)
    new_wallet: Mapped[str] = mapped_column(String(42), nullable=False)
    onchain_id: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)

    # New fields for fraction recovery support.
    token_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=RecoveryTokenType.ERC3643.value
    )
    fraction_id: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    amount: Mapped[str | None] = mapped_column(Numeric, nullable=True)

    token: Mapped[Token] = relationship("Token")
    issuer: Mapped[Issuer] = relationship("Issuer")
    from_user: Mapped[User | None] = relationship("User", foreign_keys=[from_user_id])
    to_user: Mapped[User | None] = relationship("User", foreign_keys=[to_user_id])
