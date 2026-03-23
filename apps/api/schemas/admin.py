"""Admin schemas for request/response validation."""

from datetime import datetime

from pydantic import BaseModel, Field


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
    legal_entity_name: str | None
    jurisdiction: str | None
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
    """Request for forced token transfer."""

    from_address: str
    to_address: str
    token_id: str
    amount: str
    reason: str


class RecoverRequest(BaseModel):
    """Request to recover tokens."""

    from_address: str
    token_id: str
    amount: str
    reason: str


class ComplianceActionResponse(BaseModel):
    """Compliance action response."""

    action: str
    target: str
    tx_hash: str | None = None
    audit_log_id: str


class MessageResponse(BaseModel):
    """Simple message response."""

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


class PlatformSettingsResponse(BaseModel):
    """Platform settings response."""
    default_fee_bps: str
    blocked_countries: str
    kyc_min_level: str
