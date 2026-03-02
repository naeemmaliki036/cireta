"""KYC schemas for request/response validation."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class KYCInitiateResponse(BaseModel):
    """Response for KYC initiation."""

    applicant_id: str
    access_token: str
    expiration: datetime


class KYCStatusResponse(BaseModel):
    """KYC status response."""

    status: str
    level: int
    review_status: str | None = None
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None


class SumsubWebhookPayload(BaseModel):
    """Sumsub webhook payload.

    Note: This is a simplified model. Actual Sumsub payloads vary by event type.
    """

    applicantId: str
    inspectionId: str | None = None
    correlationId: str | None = None
    externalUserId: str | None = None
    type: str  # applicantCreated, applicantPending, applicantReviewed, etc.
    reviewStatus: str | None = None  # completed, pending, init
    reviewResult: dict[str, Any] | None = None
    createdAt: str | None = None

    class Config:
        extra = "allow"  # Allow additional fields from Sumsub


class KYBDocumentRequest(BaseModel):
    """Corporate KYB initiation request."""

    company_name: str = Field(..., min_length=1, max_length=255)
    registration_number: str = Field(..., min_length=1, max_length=100)
    jurisdiction: str = Field(..., min_length=2, max_length=100)
    directors: list[dict[str, str]] = Field(default_factory=list)
    ubo_list: list[dict[str, str]] = Field(default_factory=list)


class KYBStatusResponse(BaseModel):
    """Corporate KYB status response."""

    status: str
    level: int
    company_name: str | None = None
    review_status: str | None = None
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None
