"""Identity registry sync job model.

Every change to a buyer's KYC or wallet set fans out into an arq task
that asks the platform's registrar wallet to call the on-chain identity
registry. This table records every enqueue + final outcome so we have:

- An audit trail of which wallets were registered/revoked, signed by
  whom, with what tx hash.
- A dead-letter for retries that hit the max attempt limit. The admin
  Compliance dashboard reads ``status='failed'`` rows for triage.

Idempotency: the task itself uses ``Wallet.registered_on_chain`` as the
authoritative flag — this row is just the queue + history.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.models.enums import IdentitySyncJobAction, IdentitySyncJobStatus
from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.user import User
    from apps.api.models.wallet import Wallet


class IdentitySyncJob(BaseModel):
    """One enqueued identity-registry sync operation."""

    __tablename__ = "identity_sync_jobs"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable for `provision` jobs which sync the buyer's full wallet set.
    wallet_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("wallets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[IdentitySyncJobAction] = mapped_column(
        String(20), nullable=False, index=True
    )
    status: Mapped[IdentitySyncJobStatus] = mapped_column(
        String(20),
        nullable=False,
        default=IdentitySyncJobStatus.PENDING,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # On-chain settlement metadata once the worker actually fires the tx.
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    enqueued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, insert_default=datetime.now
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship("User")
    wallet: Mapped[Wallet | None] = relationship("Wallet")

    def __repr__(self) -> str:
        return (
            f"<IdentitySyncJob(id={self.id}, user={self.user_id}, "
            f"action={self.action}, status={self.status})>"
        )
