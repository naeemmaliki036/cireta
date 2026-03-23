"""Token schemas for request/response validation."""

from decimal import Decimal

from pydantic import BaseModel, Field

from apps.api.models.enums import AssetType


class TokenCreateRequest(BaseModel):
    """Request to create a new token."""

    name: str = Field(..., min_length=1, max_length=255)
    symbol: str = Field(..., min_length=1, max_length=20)
    asset_type: AssetType = AssetType.COMMODITY
    total_supply: Decimal = Field(..., gt=0)
    decimals: int = Field(default=18, ge=0, le=18)
    ipfs_docs_hash: str | None = None
    chainlink_por_feed: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None


class TokenResponse(BaseModel):
    """Token response."""

    id: str
    issuer_id: str
    name: str
    symbol: str
    asset_type: str
    contract_address: str | None
    chain_id: int
    total_supply: str
    decimals: int
    ipfs_docs_hash: str | None
    chainlink_por_feed: str | None
    is_paused: bool
    is_deployed: bool
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    identity_registry_address: str | None = None
    compliance_address: str | None = None
    sale_contract_address: str | None = None
    vault_address: str | None = None
    fraction_token_address: str | None = None

    class Config:
        from_attributes = True


class TokenListResponse(BaseModel):
    """Paginated token list response."""

    items: list[TokenResponse]
    total: int
    page: int
    size: int
