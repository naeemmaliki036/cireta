"""Token recovery audit log model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel
from packages.common.models.encrypted_types import EncryptedString

if TYPE_CHECKING:
    from apps.api.models.issuer import Issuer
    from apps.api.models.token import Token
    from apps.api.models.user import User


class RecoveryLog(BaseModel):
    """Immutable audit trail for every token recovery action."""

    __tablename__ = "recovery_logs"

    token_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tokens.id"), nullable=False
    )
    issuer_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("issuers.id"), nullable=False
    )
    investor_user_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    lost_wallet: Mapped[str] = mapped_column(String(42), nullable=False)
    new_wallet: Mapped[str] = mapped_column(String(42), nullable=False)
    onchain_id: Mapped[str | None] = mapped_column(EncryptedString(), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)

    token: Mapped[Token] = relationship("Token")
    issuer: Mapped[Issuer] = relationship("Issuer")
    investor: Mapped[User] = relationship("User")
