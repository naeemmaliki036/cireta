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
    await issuer_service.discard_wallet(user_id)
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


@router.get("/sales")
async def list_issuer_sales(
    user_id: RequireIssuerOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    size: int = 20,
) -> dict:
    """List all sales belonging to the current issuer (all statuses)."""
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload

    from apps.api.models.issuer import Issuer
    from apps.api.models.token_sale import TokenSale

    # Find issuer for this user
    result = await db.execute(select(Issuer).where(Issuer.user_id == user_id))
    issuer = result.scalar_one_or_none()
    if not issuer:
        return {"items": [], "total": 0, "page": page, "size": size}

    # Count
    count_result = await db.execute(
        select(func.count()).select_from(TokenSale).where(TokenSale.issuer_id == issuer.id)
    )
    total = count_result.scalar() or 0

    # Fetch
    query = (
        select(TokenSale)
        .where(TokenSale.issuer_id == issuer.id)
        .options(selectinload(TokenSale.phases), selectinload(TokenSale.token), selectinload(TokenSale.issuer), selectinload(TokenSale.images))
        .order_by(TokenSale.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    sales = list(result.scalars().all())

    from apps.api.api.v1.endpoints.sales import _sale_to_response
    return {
        "items": [_sale_to_response(s) for s in sales],
        "total": total,
        "page": page,
        "size": size,
    }
