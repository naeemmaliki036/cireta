"""Admin schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class IssuerCreateRequest(BaseModel):
    """Request to onboard a new issuer."""

    user_id: str
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    legal_entity_name: str | None = None
    jurisdiction: str | None = None
    wallet_address: str | None = None


class IssuerFeeUpdateRequest(BaseModel):
    """Request to update issuer fee."""

    fee_bps: int = Field(..., ge=0, le=10000)


class IssuerResponse(BaseModel):
    """Issuer response."""

    id: str
    user_id: str
    name: str
    slug: str
    wallet_address: str | None
    fee_bps: int
    status: str
    issuer_type: str
    wallet_status: str
    identity_status: str
    identity_verified_at: datetime | None
    legal_entity_name: str | None
    jurisdiction: str | None
    email: str | None = None
    project_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class IssuerListResponse(BaseModel):
    """Paginated issuer list response."""

    items: list[IssuerResponse]
    total: int
    page: int
    size: int


# Compliance schemas
class FreezeRequest(BaseModel):
    """Request to freeze a wallet address."""

    wallet_address: str
    token_id: str | None = None
    reason: str


class UnfreezeRequest(BaseModel):
    """Request to unfreeze a wallet address."""

    wallet_address: str
    token_id: str | None = None
    reason: str


class ForcedTransferRequest(BaseModel):
    """Request to record a forced token transfer executed via dApp."""

    from_address: str
    to_address: str
    token_id: str
    amount: str
    reason: str
    tx_hash: str | None = None


class RecoverRequest(BaseModel):
    """Request to record a token recovery executed via dApp."""

    from_address: str
    to_address: str | None = None
    token_id: str
    amount: str
    reason: str
    tx_hash: str | None = None


class RecoverFractionsRequest(BaseModel):
    """Request to force-transfer ERC-1155 fraction tokens."""

    sale_id: str
    from_address: str
    to_address: str
    fraction_id: int  # 1 = USDC, 2 = OTC
    amount: str  # raw token amount (wei)
    reason: str


class ForceTransferERC3643Request(BaseModel):
    """Request to cross-user force-transfer ERC-3643 project tokens."""

    token_id: str
    from_address: str
    to_address: str
    amount: str  # raw token amount (wei)
    reason: str


class RecoveryResponse(BaseModel):
    """Response from recovery endpoints."""

    recovery_log_id: str
    tx_hash: str
    token_type: str
    from_address: str
    to_address: str
    amount: str
    from_user_email: str | None = None
    to_user_email: str | None = None


class ComplianceActionResponse(BaseModel):
    """Compliance action response."""

    action: str
    target: str
    tx_hash: str | None = None
    audit_log_id: str


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str


class OnChainRegistrationResponse(BaseModel):
    """Response after on-chain issuer registration."""

    issuer_id: str
    wallet_address: str
    tx_hash: str
    message: str


class AuditLogResponse(BaseModel):
    """Audit log entry response."""

    id: str
    actor_id: str | None
    action: str
    target_type: str
    target_id: str
    reason: str | None
    ip_address: str | None
    payload: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log response."""

    items: list[AuditLogResponse]
    total: int
    page: int
    size: int


class FrozenAddressInfo(BaseModel):
    """Derived frozen address entry from audit logs."""

    wallet_address: str
    token_id: str | None
    reason: str
    frozen_at: datetime
    audit_log_id: str


class FrozenAddressListResponse(BaseModel):
    """List of currently frozen addresses."""

    items: list[FrozenAddressInfo]
    total: int


class RedemptionUpdateRequest(BaseModel):
    """Request to update redemption status."""

    status: str  # processing, shipped, fulfilled, cancelled
    notes: str | None = None
    tracking_number: str | None = None


class DividendDepositRequest(BaseModel):
    """Request to deposit dividends for a token."""

    token_id: str
    amount_usdc: float
    contract_address: str | None = None


class PlatformSettingsRequest(BaseModel):
    """Request to update platform-wide settings."""

    default_fee_bps: str | None = None
    blocked_countries: str | None = None
    kyc_min_level: str | None = None
    support_email: str | None = None


class PlatformSettingsResponse(BaseModel):
    """Platform settings response."""

    default_fee_bps: str
    blocked_countries: str
    kyc_min_level: str


# ── Issuer Whitelist ──


class WhitelistAddRequest(BaseModel):
    """Request to add an email to the issuer whitelist."""

    email: EmailStr
    issuer_type: str = Field(
        default="individual",
        pattern=r"^(individual|corporate)$",
    )
    kyc_required: bool = True


class WhitelistEntryResponse(BaseModel):
    """Single whitelist entry."""

    id: str
    email: str
    issuer_type: str
    kyc_required: bool
    invited_by: str
    registered_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class WhitelistListResponse(BaseModel):
    """Paginated whitelist list."""

    items: list[WhitelistEntryResponse]
    total: int


# ── Issuer Onboarding ──


class IssuerOnboardingStatusResponse(BaseModel):
    """Full onboarding status for an issuer."""

    issuer_status: str
    issuer_type: str
    wallet_connected: bool
    wallet_address: str | None = None
    wallet_status: str
    identity_status: str
    kyc_required: bool = True
    can_deploy: bool
    missing_gates: list[str]


class IssuerWalletSubmitRequest(BaseModel):
    """Request from issuer to submit their wallet address with ownership proof."""

    wallet_address: str = Field(..., min_length=42, max_length=42)
    signature: str | None = Field(default=None, description="Signed message proving wallet ownership")
    nonce: str | None = Field(default=None, description="Nonce used in the signed message")
