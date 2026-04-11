"""Wallet management schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class LinkWalletRequest(BaseModel):
    address: str = Field(..., min_length=42, max_length=42)
    signature: str
    nonce: str
    is_safe: bool = False
    # Wallet label / name. UTF-8 unrestricted, max 50 chars, trimmed in
    # the service layer. Per-user case-insensitive uniqueness enforced by
    # WalletService.link_wallet.
    label: str | None = Field(None, max_length=50)


class RenameWalletRequest(BaseModel):
    """PATCH body for renaming an existing wallet's label."""

    label: str = Field(..., min_length=1, max_length=50)


class WalletDeletionRequestBody(BaseModel):
    """Request body for verified buyers asking an admin to remove a wallet."""

    reason: str | None = Field(None, max_length=500)


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
    has_pending_deletion_request: bool = False
    has_contributions: bool = False

    class Config:
        from_attributes = True


class WalletListResponse(BaseModel):
    wallets: list[WalletResponse]
    total: int


class WalletDeletionRequestResponse(BaseModel):
    """Admin-facing view of a pending wallet-deletion request."""

    id: str
    user_id: str
    user_email: str
    wallet_id: str
    wallet_address: str
    reason: str | None
    status: str
    requested_at: datetime
    reviewed_at: datetime | None
    reviewed_by: str | None
    review_notes: str | None

    class Config:
        from_attributes = True


class WalletDeletionRequestListResponse(BaseModel):
    requests: list[WalletDeletionRequestResponse]
    total: int


class WalletDeletionReviewBody(BaseModel):
    """Body for admin approve/deny actions."""

    notes: str | None = Field(None, max_length=500)
