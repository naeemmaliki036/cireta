"""Portfolio schemas for request/response validation."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from apps.api.models.enums import FulfillmentMethod


class HoldingResponse(BaseModel):
    """Token holding response."""

    token_id: str
    token_symbol: str
    token_name: str
    balance: str
    vested_amount: str
    claimable_amount: str

    class Config:
        from_attributes = True


class VestingScheduleResponse(BaseModel):
    """Vesting schedule response."""

    id: str
    token_id: str
    token_symbol: str
    total_amount: str
    claimed_amount: str
    remaining_amount: str
    claimable_amount: str
    cliff_end: datetime
    vesting_end: datetime
    cliff_passed: bool
    last_claim_at: datetime | None

    class Config:
        from_attributes = True


class VestingClaimResponse(BaseModel):
    """Vesting claim response."""

    schedule_id: str
    claimed_amount: str
    remaining_amount: str
    tx_hash: str | None = None


class RedemptionCreateRequest(BaseModel):
    """Request to create a redemption."""

    token_id: str
    amount: Decimal = Field(..., gt=0)
    fulfillment_method: FulfillmentMethod = FulfillmentMethod.CASH
    notes: str | None = None


class RedemptionResponse(BaseModel):
    """Redemption request response."""

    id: str
    token_id: str
    token_symbol: str
    amount: str
    fulfillment_method: str
    status: str
    tx_hash: str | None
    fulfilled_at: datetime | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class PortfolioSummaryResponse(BaseModel):
    """Portfolio summary response."""

    total_holdings: int
    total_vesting_schedules: int
    total_pending_redemptions: int
    holdings: list[HoldingResponse]
