"""Token sale schemas for request/response validation."""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field, field_validator, model_validator


class SalePhaseCreate(BaseModel):
    """Sale phase creation data."""

    name: str = Field(..., min_length=1, max_length=100)
    price_per_token: Decimal = Field(..., gt=0)
    allocation: Decimal = Field(..., ge=0)  # Round-5: 0 allowed for "remaining" mode
    # Required > 0. Setting min_contribution = 0 disables the first-time-buyer
    # floor on-chain entirely and is almost always a configuration mistake.
    # Mirrored by the Sale.addPhase() ZeroMinContribution() revert.
    min_contribution: Decimal = Field(..., gt=0)
    max_contribution: Decimal = Field(default=Decimal("0"))  # 0 = unlimited
    # Round-5: minimum top-up for repeat buyers — contract enforces ≥ 1000 USDC.
    top_up_min: Decimal = Field(..., ge=Decimal("1000"))
    start_time: datetime
    end_time: datetime
    whitelist_only: bool = False
    # Round-5: per-phase allocation strategy. "fixed" or "remaining".
    allocation_mode: str = Field(default="fixed", pattern="^(fixed|remaining)$")

    @model_validator(mode="after")
    def validate_phase(self) -> "SalePhaseCreate":
        if self.end_time <= self.start_time:
            raise ValueError("Phase end_time must be after start_time")
        if self.end_time.tzinfo and self.end_time <= datetime.now(timezone.utc):
            raise ValueError("Phase end_time must be in the future")
        if self.max_contribution > 0 and self.min_contribution > self.max_contribution:
            raise ValueError(
                "Phase min_contribution cannot exceed max_contribution"
            )
        # Round-5: Fixed mode requires allocation > 0
        if self.allocation_mode == "fixed" and self.allocation <= 0:
            raise ValueError("Fixed allocation_mode requires allocation > 0")
        return self


class SaleCreateRequest(BaseModel):
    """Request to create a new token sale."""

    # Content fields (Step 1-4)
    title: str | None = None
    description: str | None = None
    full_description: str | None = None
    banner_image_url: str | None = None
    is_coming_soon: bool = False
    otc_enabled: bool = False
    otc_content: str | None = None
    # Social links
    website_url: str | None = None
    twitter_url: str | None = None
    linkedin_url: str | None = None
    instagram_url: str | None = None
    facebook_url: str | None = None
    telegram_url: str | None = None
    discord_url: str | None = None
    sale_mode: str = "vested"  # "vested" or "direct"
    sale_structure: str = "phase_allocated"  # "phase_allocated" or "price_tiered"
    # OTC token (optional — can also be set after sale creation via Sale.setOTCToken())
    otc_token_address: str | None = None
    # Vesting config (Step 6, only if vested)
    cliff_duration_days: int = Field(default=0, ge=0)
    vesting_duration_days: int = Field(default=365, ge=0)
    # Token & caps (Step 7, optional for coming soon)
    token_id: str | None = None
    payment_token: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    soft_cap: Decimal = Field(default=Decimal("0"), ge=0)
    hard_cap: Decimal = Field(default=Decimal("0"), ge=0)
    # Round-5: explicit total token supply (token-decimal units)
    total_token_supply: Decimal = Field(default=Decimal("0"), ge=0)
    # Round-5: sale window. sale_end_time = None → open-ended sale.
    sale_start_time: datetime | None = None
    sale_end_time: datetime | None = None
    # Phases (Step 5, optional for coming soon)
    phases: list[SalePhaseCreate] = Field(default_factory=list)

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


class SaleUpdateRequest(BaseModel):
    """Request to update sale details. All fields optional — only provided fields are updated."""

    title: str | None = None
    description: str | None = None
    full_description: str | None = None
    banner_image_url: str | None = None
    otc_enabled: bool | None = None
    otc_content: str | None = None
    otc_token_address: str | None = None
    website_url: str | None = None
    twitter_url: str | None = None
    linkedin_url: str | None = None
    instagram_url: str | None = None
    facebook_url: str | None = None
    telegram_url: str | None = None
    discord_url: str | None = None


class ContributeRequest(BaseModel):
    """Request to contribute to a sale."""

    amount: Decimal = Field(..., gt=0, le=Decimal("1000000000"))
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
    # Aggregated from confirmed contributions in this phase. Always present;
    # zero when no contributions have been recorded.
    tokens_sold: str = "0"
    usdc_raised: str = "0"

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    """Token sale response."""

    id: str
    token_id: str | None = None
    issuer_id: str
    # Content fields
    title: str | None = None
    description_text: str | None = None
    full_description: str | None = None
    banner_image_url: str | None = None
    is_coming_soon: bool = False
    is_visible: bool = False
    otc_enabled: bool = False
    otc_content: str | None = None
    otc_token_address: str | None = None
    website_url: str | None = None
    twitter_url: str | None = None
    linkedin_url: str | None = None
    instagram_url: str | None = None
    facebook_url: str | None = None
    telegram_url: str | None = None
    discord_url: str | None = None
    sale_structure: str = "phase_allocated"
    cliff_duration_days: int = 0
    vesting_duration_days: int = 365
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
    contract_address: str | None = None
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
    token_contract_address: str | None = None
    identity_registry_address: str | None = None
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
    claim_tx_hash: str | None = None
    is_otc: bool = False
    otc_reference: str | None = None
    wallet_address: str | None = None

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

    sale_id: str | None = None  # Optional — sale_id comes from URL path
    identity_registry: str | None = Field(default=None, min_length=42, max_length=42)
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
