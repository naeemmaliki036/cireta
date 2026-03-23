"""Admin endpoints for issuer and compliance management."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import IssuerStatus
from apps.api.schemas.admin import (
    IssuerCreateRequest,
    IssuerFeeUpdateRequest,
    IssuerListResponse,
    IssuerResponse,
    PlatformSettingsRequest,
)
from apps.api.services.compliance_service import ComplianceService
from apps.api.services.issuer_service import IssuerService
from apps.api.services.platform_settings_service import PlatformSettingsService
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


async def get_issuer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IssuerService:
    """Get issuer service instance."""
    return IssuerService(db)


async def get_compliance_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceService:
    """Get compliance service instance."""
    return ComplianceService(db)


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _issuer_to_response(issuer) -> IssuerResponse:
    """Convert issuer model to response."""
    return IssuerResponse(
        id=str(issuer.id),
        user_id=str(issuer.user_id),
        name=issuer.name,
        slug=issuer.slug,
        wallet_address=issuer.wallet_address,
        fee_bps=issuer.fee_bps,
        status=(issuer.status.value if hasattr(issuer.status, "value") else issuer.status),
        legal_entity_name=issuer.legal_entity_name,
        jurisdiction=issuer.jurisdiction,
        created_at=issuer.created_at,
    )


# ==================== Issuer Management ====================


@router.get("/issuers/", response_model=IssuerListResponse)
async def list_issuers(
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    status_filter: IssuerStatus | None = None,
) -> IssuerListResponse:
    """List all issuers.

    Requires: platform_admin role.
    """
    issuers, total = await issuer_service.list_issuers(page, size, status_filter)

    return IssuerListResponse(
        items=[_issuer_to_response(i) for i in issuers],
        total=total,
        page=page,
        size=size,
    )


@router.post("/issuers/", response_model=IssuerResponse, status_code=status.HTTP_201_CREATED)
async def create_issuer(
    request: IssuerCreateRequest,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Onboard a new issuer.

    Requires: platform_admin role.
    """
    issuer = await issuer_service.onboard_issuer(
        user_id=UUID(request.user_id),
        name=request.name,
        slug=request.slug,
        legal_entity_name=request.legal_entity_name,
        jurisdiction=request.jurisdiction,
        wallet_address=request.wallet_address,
    )
    return _issuer_to_response(issuer)


@router.patch("/issuers/{issuer_id}/fee", response_model=IssuerResponse)
async def update_issuer_fee(
    issuer_id: UUID,
    request: IssuerFeeUpdateRequest,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Update issuer platform fee.

    Requires: platform_admin role.
    """
    issuer = await issuer_service.set_fee(issuer_id, request.fee_bps)
    return _issuer_to_response(issuer)


@router.post("/issuers/{issuer_id}/revoke", response_model=IssuerResponse)
async def revoke_issuer(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Revoke/suspend an issuer.

    Requires: platform_admin role.
    """
    issuer = await issuer_service.revoke_issuer(issuer_id)
    return _issuer_to_response(issuer)


@router.post("/issuers/{issuer_id}/activate", response_model=IssuerResponse)
async def activate_issuer(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Activate a pending issuer.

    Requires: platform_admin role.
    """
    issuer = await issuer_service.activate_issuer(issuer_id)
    return _issuer_to_response(issuer)


# ==================== Compliance Actions ====================


@router.get("/platform/stats")
async def get_platform_stats(_user_id: RequireAdmin, db: AsyncSession = Depends(get_db)) -> dict:
    """Platform-wide analytics: TVL, users, issuers, fees, active sales."""
    from sqlalchemy import func, select

    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.token_sale import TokenSale
    from apps.api.models.user import User

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_issuers = (
        await db.execute(select(func.count(Issuer.id)).where(Issuer.is_whitelisted.is_(True)))
    ).scalar_one()
    active_sales = (
        await db.execute(select(func.count(TokenSale.id)).where(TokenSale.status == "active"))
    ).scalar_one()
    tvl = (
        await db.execute(
            select(func.coalesce(func.sum(Contribution.amount), 0)).where(
                Contribution.tokens_claimed.is_(True)
            )
        )
    ).scalar_one()
    total_raised = (
        await db.execute(select(func.coalesce(func.sum(Contribution.amount), 0)))
    ).scalar_one()
    fees_collected = (
        await db.execute(select(func.coalesce(func.sum(TokenSale.platform_fee_collected), 0)))
    ).scalar_one()

    return {
        "total_users": total_users,
        "total_issuers": total_issuers,
        "active_sales": active_sales,
        "tvl_usdc": float(tvl),
        "total_raised_usdc": float(total_raised),
        "platform_fees_collected_usdc": float(fees_collected),
    }


async def get_settings_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformSettingsService:
    """Get platform settings service instance."""
    return PlatformSettingsService(db)


@router.get("/platform/settings")
async def get_platform_settings(
    _user_id: RequireAdmin,
    service: Annotated[PlatformSettingsService, Depends(get_settings_service)],
) -> dict:
    """Get current platform settings."""
    return await service.load()


@router.patch("/platform/settings")
async def update_platform_settings(
    _user_id: RequireAdmin,
    request: PlatformSettingsRequest,
    service: Annotated[PlatformSettingsService, Depends(get_settings_service)],
) -> dict:
    """Update platform-wide settings (fee rates, blocked countries, etc.)."""
    current = await service.update_many(
        default_fee_bps=request.default_fee_bps,
        blocked_countries=request.blocked_countries,
        kyc_min_level=request.kyc_min_level,
    )
    return {"message": "Settings updated", **current}
