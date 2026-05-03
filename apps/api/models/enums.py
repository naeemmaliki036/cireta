"""Enumeration types for Cireta models."""

from enum import Enum


class UserRole(str, Enum):
    INVESTOR = "investor"
    ISSUER = "issuer"
    ADMIN = "admin"


class KYCStatus(str, Enum):
    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class IssuerStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class WalletApprovalStatus(str, Enum):
    NONE = "none"
    VERIFIED = "verified"  # Signed but not yet submitted for approval
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


class IdentityVerificationStatus(str, Enum):
    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class IssuerType(str, Enum):
    INDIVIDUAL = "individual"
    CORPORATE = "corporate"


class AssetType(str, Enum):
    COMMODITY = "commodity"
    REAL_ESTATE = "real_estate"
    INFRASTRUCTURE = "infrastructure"
    ENERGY = "energy"
    AGRICULTURE = "agriculture"
    FUTURES = "futures"
    EQUITY = "equity"
    DEBT = "debt"
    FUND = "fund"
    OTHER = "other"


class SaleStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    APPROVED_COMING_SOON = "approved_coming_soon"
    ACTIVE = "active"
    PAUSED = "paused"
    FINALIZED_SUCCESS = "finalized_success"
    FINALIZED_FAILED = "finalized_failed"
    TOKENS_DISTRIBUTED = "tokens_distributed"
    REFUNDS_ENABLED = "refunds_enabled"
    REJECTED = "rejected"
    # Legacy aliases kept for backward compat
    FINALIZED = "finalized"
    FAILED = "failed"


class SaleMode(str, Enum):
    DIRECT = "direct"
    VESTED = "vested"


class SaleStructure(str, Enum):
    PHASE_ALLOCATED = "phase_allocated"
    PRICE_TIERED = "price_tiered"


class ContributionStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CLAIMED = "claimed"
    REFUNDED = "refunded"


class FulfillmentMethod(str, Enum):
    PHYSICAL = "physical"
    CASH = "cash"


class RedemptionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class WalletDeletionRequestStatus(str, Enum):
    """Lifecycle of a buyer-initiated request to remove a wallet from
    their KYC-verified profile. Verified users cannot self-delete; an
    admin reviews + approves/denies."""

    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class RecoveryTokenType(str, Enum):
    """Which token type was recovered."""

    ERC3643 = "erc3643"
    FRACTION_1155 = "fraction_1155"


class IdentitySyncJobStatus(str, Enum):
    """Lifecycle of an enqueued identity-registry sync job (whitelist add
    or revoke). Powers the dead-letter / audit dashboard."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class IdentitySyncJobAction(str, Enum):
    """What the worker should do when picking up an identity sync job."""

    PROVISION = "provision"  # Re-sync the buyer's full wallet set after KYC approval
    ADD = "add"  # Whitelist a single newly-linked wallet
    REMOVE = "remove"  # Revoke a single wallet (admin-approved deletion)


class RedemptionType(str, Enum):
    """How token holders can redeem their tokens for the underlying asset."""

    NONE = "none"
    MANUAL_OFF_CHAIN = "manual_off_chain"
    ON_CHAIN = "on_chain"
