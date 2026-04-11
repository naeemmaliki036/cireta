"""Wallet deletion request model.

Verified buyers cannot self-delete a wallet from their profile. Instead,
deleting a wallet from a KYC-approved profile creates a row here in
``pending`` state; an admin reviews and approves/denies. On approve, the
wallet is unlinked AND a ``task_sync_wallet`` job is enqueued to revoke
the wallet from the on-chain identity registry.

Wallets that have ever participated in a sale (i.e. there's at least one
``Contribution`` row for ``contribution.wallet_address == wallet.address_checksum``)
are NOT eligible for deletion at all — those rows never reach this table.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import WalletDeletionRequestStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.user import User
    from apps.api.models.wallet import Wallet


class WalletDeletionRequest(BaseModel):
    """A buyer-initiated request to remove a wallet from their profile."""

    __tablename__ = "wallet_deletion_requests"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wallet_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Snapshot the address at request time so the admin still has it after
    # the wallet row is unlinked / deleted on approval.
    wallet_address_snapshot: Mapped[str] = mapped_column(String(42), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[WalletDeletionRequestStatus] = mapped_column(
        String(20),
        nullable=False,
        default=WalletDeletionRequestStatus.PENDING,
        index=True,
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, insert_default=datetime.now
    )
    reviewed_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships — both FKs land on `users`, so disambiguate.
    user: Mapped[User] = relationship("User", foreign_keys=[user_id])
    reviewer: Mapped[User | None] = relationship("User", foreign_keys=[reviewed_by])
    wallet: Mapped[Wallet] = relationship("Wallet")

    def __repr__(self) -> str:
        return (
            f"<WalletDeletionRequest(id={self.id}, user={self.user_id}, "
            f"wallet={self.wallet_address_snapshot}, status={self.status})>"
        )
