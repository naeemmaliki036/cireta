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


class AssetType(str, Enum):
    COMMODITY = "commodity"
    FUTURES = "futures"


class SaleStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    FINALIZED_SUCCESS = "finalized_success"
    FINALIZED_FAILED = "finalized_failed"
    TOKENS_DISTRIBUTED = "tokens_distributed"
    REFUNDS_ENABLED = "refunds_enabled"
    # Legacy aliases kept for backward compat
    FINALIZED = "finalized"
    FAILED = "failed"


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
