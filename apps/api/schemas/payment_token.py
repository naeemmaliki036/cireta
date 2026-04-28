"""Pydantic schemas for payment tokens."""

from pydantic import BaseModel, Field


class PaymentTokenResponse(BaseModel):
    """Public response for a payment token."""

    id: str
    address: str
    symbol: str
    name: str
    chain_id: int
    decimals: int
    sort_order: int
    is_active: bool

    class Config:
        from_attributes = True


class PaymentTokenCreate(BaseModel):
    """Admin: create a new accepted payment token."""

    address: str = Field(min_length=42, max_length=42)
    symbol: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    chain_id: int
    decimals: int = 6
    sort_order: int = 0
    is_active: bool = True


class PaymentTokenUpdate(BaseModel):
    """Admin: partial update of a payment token."""

    symbol: str | None = None
    name: str | None = None
    chain_id: int | None = None
    decimals: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class PaymentTokenListResponse(BaseModel):
    """List of payment tokens."""

    items: list[PaymentTokenResponse]
