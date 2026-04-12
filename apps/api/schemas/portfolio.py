"""Portfolio schemas for request/response validation."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from apps.api.models.enums import FulfillmentMethod


class HoldingResponse(BaseModel):
    """Token holding response.

    Each row represents either:
    - Unlocked: ERC-3643 project tokens the buyer holds (transferable).
    - Locked: soul-bound fraction tokens still in vesting (not transferable).
    The frontend uses `locked` to render two separate sections.
    """

    token_id: str
    token_symbol: str
    token_name: str
    asset_type: str = "commodity"
    balance: str
    value_usd: str = "0"
    vested_amount: str
    claimable_amount: str
    claimable: str = "0"
    locked: bool = False

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
    is_revocable: bool = True
    is_revoked: bool = False

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
    rejection_reason: str | None = None
    delivery_details: str | None = None
    tracking_number: str | None = None
    shipped_at: datetime | None = None
    delivery_name: str | None = None
    delivery_address: str | None = None
    delivery_phone: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PortfolioSummaryResponse(BaseModel):
    """Portfolio summary response."""

    total_holdings: int
    total_vesting_schedules: int
    total_pending_redemptions: int
    total_value_usd: str = "0"
    total_invested_usd: str = "0"
    holdings: list[HoldingResponse]


class VaultClaimableResponse(BaseModel):
    """On-chain vault claimable amount response."""

    sale_id: str
    vault_address: str
    investor_address: str
    claimable: str
    total_fractions: str
    claimed_amount: str
    vested: str
    finalized: bool
    cliff_duration: int
    vesting_duration: int
    vesting_start_time: int
