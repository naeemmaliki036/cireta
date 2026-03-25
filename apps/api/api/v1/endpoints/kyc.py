"""KYC endpoints for Sumsub integration.

CRITICAL: Webhook endpoint validates HMAC-SHA256 signature BEFORE processing.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.sumsub_crypto import validate_sumsub_signature
from apps.api.schemas.kyc import (
    KYBDocumentRequest,
    KYBStatusResponse,
    KYCInitiateResponse,
    KYCStatusResponse,
)
from apps.api.services.kyc_service import KYCService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.core.config import settings
from packages.common.db.session import get_db

router = APIRouter(prefix="/kyc", tags=["kyc"])


async def get_kyc_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KYCService:
    """Get KYC service instance."""
    return KYCService(db)


@router.post("/initiate", response_model=KYCInitiateResponse)
async def initiate_kyc(
    user_id: CurrentUserId,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> KYCInitiateResponse:
    """Initiate KYC process for authenticated user.

    Returns Sumsub access token for WebSDK integration.
    Requires: kyc_level >= 1 (enforced by endpoint access rules).
    """
    result = await kyc_service.initiate(user_id)

    return KYCInitiateResponse(
        applicant_id=result["applicant_id"],
        access_token=result["access_token"],
        expiration=result["expiration"],
    )


@router.get("/status", response_model=KYCStatusResponse)
async def get_kyc_status(
    user_id: CurrentUserId,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> KYCStatusResponse:
    """Get KYC status for authenticated user."""
    result = await kyc_service.get_status(user_id)

    return KYCStatusResponse(
        status=result["status"],
        level=result["level"],
        review_status=result["review_status"],
        submitted_at=result["submitted_at"],
        reviewed_at=result["reviewed_at"],
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def sumsub_webhook(
    request: Request,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> dict[str, str]:
    """Handle Sumsub webhook callbacks.

    CRITICAL: This endpoint validates HMAC-SHA256 signature
    from Sumsub BEFORE any processing. Invalid signatures return 401.
    The signature is in the X-Payload-Digest header. The X-App-Token is also checked.
    """
    # Read raw body for HMAC validation
    body = await request.body()
    signature = request.headers.get("X-Payload-Digest")
    app_token = request.headers.get("X-App-Token")

    if not signature or not app_token:
        raise HTTPException(status_code=401, detail="Missing Sumsub webhook headers")

    from packages.common.core.config import settings
    from apps.api.services.kyc_service import create_hmac_signature

    # Validate X-App-Token field against settings.sumsub_app_token
    if app_token != settings.sumsub_app_token:
        raise HTTPException(status_code=401, detail="Invalid Sumsub App Token")

    # Validate HMAC signature
    expected_signature = create_hmac_signature(settings.sumsub_secret_key, body)
    if signature != f"sha256={expected_signature}":
        # Use a constant time comparison to avoid timing attacks
        import hmac
        import hashlib
        if not hmac.compare_digest(f"sha256={expected_signature}".encode(), signature.encode()):
            raise HTTPException(status_code=401, detail="Invalid Sumsub HMAC signature")

    # Get signature from header
    # Sumsub uses X-Payload-Digest for HMAC signature
    sig_header = request.headers.get("X-Payload-Digest", "")

    # CRITICAL: Validate HMAC BEFORE any processing
    if not validate_sumsub_signature(body, sig_header, settings.sumsub_secret_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_SIGNATURE", "message": "Invalid webhook signature"},
        )

    # Parse payload after validation
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PAYLOAD", "message": "Invalid JSON payload"},
        ) from None

    # Store webhook event first for reliable retry
    from sqlalchemy.ext.asyncio import AsyncSession

    from apps.api.models.webhook_event import WebhookEvent

    db: AsyncSession = kyc_service.db
    webhook_event = WebhookEvent()
    webhook_event.provider = "sumsub"
    webhook_event.payload = payload
    webhook_event.status = "pending"
    db.add(webhook_event)
    await db.flush()

    # Get client IP for audit logging — use request.client (set by trusted proxy)
    # rather than X-Forwarded-For which can be spoofed by untrusted clients
    ip_address = request.client.host if request.client else None

    # Process webhook inline — if it fails, the background worker will retry
    try:
        await kyc_service.handle_webhook(payload, ip_address)
        webhook_event.status = "processed"
        webhook_event.attempts = 1
        from datetime import UTC, datetime

        webhook_event.processed_at = datetime.now(UTC)
    except Exception:
        webhook_event.attempts = 1
        webhook_event.last_error = "Initial processing failed — queued for retry"
        # Leave status as "pending" so the worker retries

    await db.commit()
    return {"status": "ok"}


@router.post("/corporate/initiate", response_model=KYCInitiateResponse)
async def initiate_corporate_kyb(
    user_id: CurrentUserId,
    body: KYBDocumentRequest,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> KYCInitiateResponse:
    """Initiate corporate KYB process.

    Stores company details and creates Sumsub applicant with business level.
    Sets investor_type to 'corporate' on the user.
    """
    result = await kyc_service.initiate_corporate(user_id, body)
    return KYCInitiateResponse(
        applicant_id=result["applicant_id"],
        access_token=result["access_token"],
        expiration=result["expiration"],
    )


@router.get("/corporate/status", response_model=KYBStatusResponse)
async def get_corporate_kyb_status(
    user_id: CurrentUserId,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> KYBStatusResponse:
    """Get corporate KYB status for authenticated user."""
    result = await kyc_service.get_corporate_status(user_id)
    return KYBStatusResponse(**result)


@router.post("/corporate/webhook", status_code=status.HTTP_200_OK)
async def corporate_kyb_webhook(
    request: Request,
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> dict[str, str]:
    """Handle Sumsub corporate KYB webhook.

    Same HMAC validation as personal KYC webhook.
    On GREEN review, sets kyc_level=4.
    """
    body = await request.body()
    sig_header = request.headers.get("X-Payload-Digest", "")
    if not validate_sumsub_signature(body, sig_header, settings.sumsub_secret_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_SIGNATURE", "message": "Invalid webhook signature"},
        )
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PAYLOAD", "message": "Invalid JSON payload"},
        ) from None

    ip_address = request.client.host if request.client else None
    await kyc_service.handle_corporate_webhook(payload, ip_address)
    return {"status": "ok"}
