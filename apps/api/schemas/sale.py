"""Token sale schemas for request/response validation."""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field, field_validator, model_validator


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

    @model_validator(mode="after")
    def validate_phase(self) -> "SalePhaseCreate":
        # end_time must be after start_time
        if self.end_time <= self.start_time:
            raise ValueError("Phase end_time must be after start_time")
        # start_time must be in the future
        if self.start_time.tzinfo and self.start_time < datetime.now(timezone.utc):
            raise ValueError("Phase start_time must be in the future")
        # min_contribution <= max_contribution (when max > 0)
        if self.max_contribution > 0 and self.min_contribution > self.max_contribution:
            raise ValueError(
                "Phase min_contribution cannot exceed max_contribution"
            )
        return self


class SaleCreateRequest(BaseModel):
    """Request to create a new token sale."""

    token_id: str
    payment_token: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  # USDC on Base
    soft_cap: Decimal = Field(..., gt=0)
    hard_cap: Decimal = Field(..., gt=0)
    phases: list[SalePhaseCreate] = Field(..., min_length=1)

    @field_validator("soft_cap", "hard_cap", mode="before")
    @classmethod
    def validate_decimal_format(cls, v: object) -> object:
        """Reject scientific notation and non-standard numeric formats."""
        if isinstance(v, str):
            # Reject scientific notation (1e18, 2.5E10, etc.)
            if "e" in v.lower():
                raise ValueError("Scientific notation not allowed — use plain decimal")
            try:
                Decimal(v)
            except InvalidOperation:
                raise ValueError("Invalid decimal format")
        return v

    @model_validator(mode="after")
    def validate_sale(self) -> "SaleCreateRequest":
        # soft_cap must be <= hard_cap
        if self.soft_cap > self.hard_cap:
            raise ValueError("soft_cap cannot exceed hard_cap")
        # Check for overlapping phase dates
        phases_sorted = sorted(self.phases, key=lambda p: p.start_time)
        for i in range(1, len(phases_sorted)):
            if phases_sorted[i].start_time < phases_sorted[i - 1].end_time:
                raise ValueError(
                    f"Phase '{phases_sorted[i].name}' overlaps with "
                    f"'{phases_sorted[i - 1].name}'"
                )
        return self


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
    platform_fee_bps: int = 250
    fee_cap_usdc: str | None = None
    total_raised_on_platform: str = "0"
    platform_fee_collected: str = "0"
    sale_mode: str = "vested"
    vault_address: str | None = None
    fraction_token_address: str | None = None
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
    is_otc: bool = False

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str


class OTCAllocateRequest(BaseModel):
    """OTC allocation request."""

    investor_wallet: str = Field(..., min_length=42, max_length=42)
    token_amount: float = Field(..., gt=0)
    payment_reference: str = Field(..., min_length=1, max_length=255)
    notes: str | None = None


class SaleDeployRequest(BaseModel):
    """Request to deploy a sale contract on-chain."""

    sale_id: str
    identity_registry: str = Field(..., min_length=42, max_length=42)
    fee_basis_points: int = Field(default=250, ge=0, le=10000)
    fee_cap_usdc: Decimal = Field(default=Decimal("0"))


class SaleDeployResponse(BaseModel):
    """Response from sale contract deployment."""

    sale_id: str
    sale_address: str
    tx_hash: str
    status: str = "deployed"


class SaleOnChainStatusResponse(BaseModel):
    """On-chain sale status."""

    status: str
    total_raised: str
    soft_cap: str
    hard_cap: str
    phases: list[dict]
