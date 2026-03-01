"""Wallet management schemas."""

from pydantic import BaseModel, Field


class LinkWalletRequest(BaseModel):
    address: str = Field(..., min_length=42, max_length=42)
    signature: str
    nonce: str
    is_safe: bool = False
    label: str | None = Field(None, max_length=100)


class SetPrimaryRequest(BaseModel):
    pass  # No body needed — address in path


class WalletResponse(BaseModel):
    id: str
    address: str
    chain_id: int
    is_primary: bool
    is_safe: bool
    registered_on_chain: bool
    label: str | None
    linked_at: str

    class Config:
        from_attributes = True


class WalletListResponse(BaseModel):
    wallets: list[WalletResponse]
    total: int
