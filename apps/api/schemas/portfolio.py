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
    is_redeemable: bool = False
    # "none" | "manual_off_chain" | "on_chain" — drives whether the
    # Redeem button on the holding row opens the RedemptionRequestModal
    # (on_chain) or links out to the issuer's manual instructions.
    redemption_type: str | None = None
    # Deployed RedemptionManager address — only populated for on_chain
    # tokens. RedemptionRequestModal needs this to sign requestRedemption.
    redemption_manager_address: str | None = None
    sale_mode: str = "direct"
    # On-chain token contract — needed by /portfolio/transfer to look up
    # balanceOf and submit transfer txs.
    contract_address: str | None = None
    # Vesting timeline — populated for vested holdings, None for direct.
    vesting_progress: float = 0.0
    cliff_end: datetime | None = None
    vesting_end: datetime | None = None
    next_unlock_at: datetime | None = None

    class Config:
        from_attributes = True


class VestingScheduleResponse(BaseModel):
    """Vesting schedule response."""

    id: str
    token_id: str
    token_symbol: str
    token_name: str = ""
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
    # Sale-linked fields used by the claim page to dispatch the on-chain call.
    sale_mode: str = "vested"
    vault_address: str | None = None
    sale_contract_address: str | None = None
    fraction_token_address: str | None = None

    class Config:
        from_attributes = True


class VestingClaimResponse(BaseModel):
    """Vesting claim response."""

    schedule_id: str
    claimed_amount: str
    remaining_amount: str
    tx_hash: str | None = None


class RedemptionCreateRequest(BaseModel):
    """Request to create a redemption.

    For physical fulfilment, supply EITHER ``shipping_address_id`` to use
    an existing book row, OR the inline ``delivery_*`` fields. The server
    treats the picked book row as authoritative (its values overwrite any
    inline fields supplied alongside it).
    """

    token_id: str
    amount: Decimal = Field(..., gt=0)
    fulfillment_method: FulfillmentMethod = FulfillmentMethod.CASH
    notes: str | None = None
    shipping_address_id: str | None = None
    # Inline fallback when the user hasn't saved the address yet.
    delivery_name: str | None = Field(default=None, max_length=255)
    delivery_address: str | None = Field(default=None, max_length=2000)
    delivery_phone: str | None = Field(default=None, max_length=40)
    delivery_country: str | None = Field(default=None, min_length=3, max_length=3)


class RedemptionResponse(BaseModel):
    """Redemption request response."""

    id: str
    token_id: str
    token_symbol: str
    token_name: str | None = None
    token_contract_address: str | None = None
    redemption_manager_address: str | None = None
    onchain_id: int | None = None
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
    shipping_country_mismatch: bool = False
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
