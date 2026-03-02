"""Token document model — stores IPFS-uploaded legal documents."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token import Token


class TokenDocument(BaseModel):
    """Legal or disclosure document attached to a token, stored on IPFS."""

    __tablename__ = "token_documents"

    token_id: Mapped[PGUUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tokens.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(
        Enum("prospectus", "subscription", "audit", "other", name="token_doc_type"),
        nullable=False,
        default="other",
    )
    ipfs_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)

    token: Mapped[Token] = relationship("Token", back_populates="documents")
