"""Token schemas for request/response validation."""

import re
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from apps.api.models.enums import AssetType

# Max supply: 10 billion tokens with 18 decimals
_MAX_SUPPLY = Decimal("10000000000")
_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,11}$")


class TokenCreateRequest(BaseModel):
    """Request to create a new token."""

    name: str = Field(..., min_length=1, max_length=255)
    symbol: str = Field(..., min_length=1, max_length=11)
    asset_type: AssetType = AssetType.COMMODITY
    total_supply: Decimal = Field(..., gt=0, le=_MAX_SUPPLY)
    decimals: int = Field(default=6, ge=0, le=6)
    ipfs_docs_hash: str | None = None
    chainlink_por_feed: str | None = None
    slug: str | None = None
    description: str | None = None
    image_url: str | None = None
    max_supply: Decimal | None = Field(default=None, gt=0, le=_MAX_SUPPLY)
    mintable: bool = True

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        v = v.upper().strip()
        if not _SYMBOL_RE.match(v):
            raise ValueError(
                "Symbol must be 1-11 alphanumeric characters (A-Z, 0-9)"
            )
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        # Strip HTML tags (XSS) and reject emoji-only names
        import html as _html

        v = re.sub(r"<[^>]+>", "", v)
        v = _html.escape(v, quote=True)
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty or whitespace-only")
        return v


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
    created_at: str | None = None
    max_supply: str | None = None
    mintable: bool = True
    current_supply: str | None = None

    class Config:
        from_attributes = True


class TokenListResponse(BaseModel):
    """Paginated token list response."""

    items: list[TokenResponse]
    total: int
    page: int
    size: int
