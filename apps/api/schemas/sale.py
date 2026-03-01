"""Token sale schemas for request/response validation."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class SalePhaseCreate(BaseModel):
    """Sale phase creation data."""

    name: str = Field(..., min_length=1, max_length=100)
    price_per_token: Decimal = Field(..., gt=0)
    allocation: Decimal = Field(..., gt=0)
    min_contribution: Decimal = Field(default=Decimal("0"))
    max_contribution: Decimal = Field(default=Decimal("0"))  # 0 = unlimited
    start_time: datetime
    end_time: datetime
    whitelist_only: bool = False


class SaleCreateRequest(BaseModel):
    """Request to create a new token sale."""

    token_id: str
    payment_token: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  # USDC on Base
    soft_cap: Decimal = Field(..., gt=0)
    hard_cap: Decimal = Field(..., gt=0)
    phases: list[SalePhaseCreate] = Field(..., min_length=1)


class ContributeRequest(BaseModel):
    """Request to contribute to a sale."""

    amount: Decimal = Field(..., gt=0)
    tx_hash: str = Field(..., min_length=66, max_length=66)


class SalePhaseResponse(BaseModel):
    """Sale phase response."""

    id: str
    phase_number: int
    name: str
    price_per_token: str
    allocation: str
    min_contribution: str
    max_contribution: str
    start_time: datetime
    end_time: datetime
    whitelist_only: bool
    is_active: bool

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    """Token sale response."""

    id: str
    token_id: str
    issuer_id: str
    payment_token: str
    soft_cap: str
    hard_cap: str
    status: str
    total_raised: str
    is_active: bool
    soft_cap_reached: bool
    hard_cap_reached: bool
    remaining_capacity: str
    phases: list[SalePhaseResponse]
    # Joined token fields
    token_name: str | None = None
    token_symbol: str | None = None
    token_slug: str | None = None
    token_asset_type: str | None = None
    token_description: str | None = None
    token_image_url: str | None = None
    issuer_name: str | None = None
    issuer_slug: str | None = None

    class Config:
        from_attributes = True


class SaleListResponse(BaseModel):
    """Paginated sale list response."""

    items: list[SaleResponse]
    total: int
    page: int
    size: int


class ContributionResponse(BaseModel):
    """Contribution response."""

    id: str
    sale_id: str
    phase_id: str
    amount: str
    tokens_allocated: str
    tx_hash: str
    status: str
    claimed_at: datetime | None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
