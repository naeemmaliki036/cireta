"""SaleSubscription model — tracks investor interest in coming-soon sales."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.user import User


class SaleSubscription(BaseModel):
    """Tracks users who subscribed to be notified when a coming-soon sale launches."""

    __tablename__ = "sale_subscriptions"
    __table_args__ = (
        UniqueConstraint("sale_id", "email", name="uq_sale_subscription_email"),
    )

    sale_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("token_sales.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    sale: Mapped[TokenSale] = relationship()
    user: Mapped[User | None] = relationship()
