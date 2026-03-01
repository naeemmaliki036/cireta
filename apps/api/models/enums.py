"""Enumeration types for Cireta models."""

from enum import Enum


class UserRole(str, Enum):
    """User role enumeration."""

    INVESTOR = "investor"
    ISSUER = "issuer"
    ADMIN = "admin"


class KYCStatus(str, Enum):
    """KYC verification status."""

    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class IssuerStatus(str, Enum):
    """Issuer approval status."""

    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class AssetType(str, Enum):
    """Token asset type."""

    COMMODITY = "commodity"
    FUTURES = "futures"


class SaleStatus(str, Enum):
    """Token sale status."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    FINALIZED = "finalized"
    FAILED = "failed"


class ContributionStatus(str, Enum):
    """Contribution transaction status."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    CLAIMED = "claimed"
    REFUNDED = "refunded"


class FulfillmentMethod(str, Enum):
    """Redemption fulfillment method."""

    PHYSICAL = "physical"
    CASH = "cash"


class RedemptionStatus(str, Enum):
    """Redemption request status."""

    PENDING = "pending"
    PROCESSING = "processing"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"
