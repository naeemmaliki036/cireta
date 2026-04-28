"""Payment tokens (stablecoins) accepted for sale contributions."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class PaymentToken(BaseModel):
    """A payment token (stablecoin) that issuers can accept for token sales.

    Driven entirely by DB so adding a new accepted stablecoin (e.g. USDT, DAI)
    does not require a frontend code change — admin updates this table and the
    sale-creation dropdown picks it up automatically.
    """

    __tablename__ = "payment_tokens"

    address: Mapped[str] = mapped_column(String(42), unique=True, index=True)
    symbol: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    chain_id: Mapped[int] = mapped_column(Integer)
    decimals: Mapped[int] = mapped_column(Integer, default=6)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    def __repr__(self) -> str:
        return f"<PaymentToken(symbol={self.symbol}, address={self.address})>"
