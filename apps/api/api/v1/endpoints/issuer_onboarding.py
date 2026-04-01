"""Issuer onboarding endpoints — wallet, identity verification, status."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.admin import (
    IssuerOnboardingStatusResponse,
    IssuerWalletSubmitRequest,
)
from apps.api.services.issuer_service import IssuerService
from apps.api.services.kyc_service import KYCService
from packages.common.core.auth_deps import RequireIssuerOrAdmin
from packages.common.db.session import get_db

router = APIRouter(prefix="/issuer", tags=["issuer-onboarding"])


async def get_issuer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IssuerService:
    return IssuerService(db)


async def get_kyc_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KYCService:
    return KYCService(db)


@router.post("/wallet")
async def submit_wallet(
    request: IssuerWalletSubmitRequest,
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> dict:
    """Issuer connects and verifies wallet (signed, not yet submitted for approval)."""
    issuer = await issuer_service.submit_wallet(user_id, request.wallet_address)
    return {
        "wallet_address": issuer.wallet_address,
        "wallet_status": issuer.wallet_status.value if hasattr(issuer.wallet_status, "value") else str(issuer.wallet_status),
    }


@router.post("/wallet/submit-for-approval")
async def submit_wallet_for_approval(
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> dict:
    """Issuer explicitly submits their verified wallet for admin approval."""
    issuer = await issuer_service.submit_wallet_for_approval(user_id)
    return {
        "wallet_address": issuer.wallet_address,
        "wallet_status": issuer.wallet_status.value if hasattr(issuer.wallet_status, "value") else str(issuer.wallet_status),
    }


@router.delete("/wallet")
async def discard_wallet(
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> dict:
    """Discard verified wallet before submission. Not allowed after submission or approval."""
    issuer = await issuer_service.discard_wallet(user_id)
    return {"wallet_status": "none"}


@router.post("/identity/initiate")
async def initiate_identity_verification(
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
    kyc_service: Annotated[KYCService, Depends(get_kyc_service)],
) -> dict:
    """Start KYC (individual) or KYB (corporate) based on issuer type.

    Returns a Sumsub WebSDK access token.
    """
    from sqlalchemy import select

    from apps.api.models.issuer import Issuer

    result = await issuer_service.db.execute(
        select(Issuer).where(Issuer.user_id == user_id)
    )
    issuer = result.scalar_one_or_none()
    if not issuer:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_AN_ISSUER", "message": "User is not an issuer"},
        )

    # Determine KYC vs KYB
    from apps.api.models.enums import IssuerType
    if issuer.issuer_type == IssuerType.CORPORATE:
        result_data = await kyc_service.initiate_corporate(user_id, body=None)
    else:
        result_data = await kyc_service.initiate(user_id)

    # Update issuer identity status
    await issuer_service.set_identity_pending(user_id, result_data["applicant_id"])

    return {
        "applicant_id": result_data["applicant_id"],
        "access_token": result_data["access_token"],
        "expiration": result_data.get("expiration"),
        "verification_type": "kyb" if issuer.issuer_type == IssuerType.CORPORATE else "kyc",
    }


@router.get("/identity/status")
async def get_identity_status(
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> dict:
    """Get current identity verification status."""
    from sqlalchemy import select

    from apps.api.models.issuer import Issuer

    result = await issuer_service.db.execute(
        select(Issuer).where(Issuer.user_id == user_id)
    )
    issuer = result.scalar_one_or_none()
    if not issuer:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_AN_ISSUER", "message": "User is not an issuer"},
        )

    def _val(v: object) -> str:
        return v.value if hasattr(v, "value") else str(v)

    return {
        "identity_status": _val(issuer.identity_status),
        "identity_verified_at": issuer.identity_verified_at,
        "issuer_type": _val(issuer.issuer_type),
        "verification_type": "kyb" if _val(issuer.issuer_type) == "corporate" else "kyc",
    }


@router.get("/onboarding-status", response_model=IssuerOnboardingStatusResponse)
async def get_onboarding_status(
    user_id: RequireIssuerOrAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerOnboardingStatusResponse:
    """Get full onboarding status with all gates."""
    data = await issuer_service.get_onboarding_status(user_id)
    return IssuerOnboardingStatusResponse(**data)
