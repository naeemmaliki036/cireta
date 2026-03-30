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
    FUTURES = "futures"


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
