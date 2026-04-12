"""Admin endpoints for issuer and compliance management."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import IssuerStatus
from apps.api.schemas.admin import (
    IssuerCreateRequest,
    IssuerFeeUpdateRequest,
    IssuerListResponse,
    IssuerResponse,
    OnChainRegistrationResponse,
    PlatformSettingsRequest,
    WhitelistAddRequest,
    WhitelistEntryResponse,
)
from apps.api.services.compliance_service import ComplianceService
from apps.api.services.issuer_service import IssuerService
from apps.api.services.platform_settings_service import PlatformSettingsService
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

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
    """Extract client IP from request using trusted proxy connection info."""
    return request.client.host if request.client else None


def _issuer_to_response(issuer) -> IssuerResponse:
    """Convert issuer model to response."""
    email = None
    if hasattr(issuer, "user") and issuer.user is not None:
        email = issuer.user.email
    project_count = len(issuer.token_sales) if hasattr(issuer, "token_sales") and issuer.token_sales else 0
    return IssuerResponse(
        id=str(issuer.id),
        user_id=str(issuer.user_id),
        name=issuer.name,
        slug=issuer.slug,
        wallet_address=issuer.wallet_address,
        fee_bps=issuer.fee_bps,
        status=(issuer.status.value if hasattr(issuer.status, "value") else issuer.status),
        issuer_type=(issuer.issuer_type.value if hasattr(issuer.issuer_type, "value") else issuer.issuer_type),
        wallet_status=(issuer.wallet_status.value if hasattr(issuer.wallet_status, "value") else issuer.wallet_status),
        identity_status=(issuer.identity_status.value if hasattr(issuer.identity_status, "value") else issuer.identity_status),
        identity_verified_at=issuer.identity_verified_at,
        legal_entity_name=issuer.legal_entity_name,
        jurisdiction=issuer.jurisdiction,
        email=email,
        project_count=project_count,
        created_at=issuer.created_at,
    )


# ==================== Issuer Whitelist ====================
# NOTE: Whitelist routes MUST be defined before /issuers/{issuer_id}
# so FastAPI doesn't match "whitelist" as a UUID path parameter.


def _whitelist_to_response(e) -> WhitelistEntryResponse:
    return WhitelistEntryResponse(
        id=str(e.id),
        email=e.email,
        issuer_type=e.issuer_type.value if hasattr(e.issuer_type, "value") else (e.issuer_type or "individual"),
        kyc_required=e.kyc_required if e.kyc_required is not None else True,
        invited_by=str(e.invited_by) if e.invited_by else "",
        registered_at=e.registered_at,
        created_at=e.created_at,
    )


@router.post("/issuers/whitelist", response_model=WhitelistEntryResponse, status_code=status.HTTP_201_CREATED)
async def add_to_whitelist(
    request: WhitelistAddRequest,
    user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> WhitelistEntryResponse:
    """Add an email to the issuer whitelist."""
    entry = await issuer_service.add_to_whitelist(
        email=request.email,
        issuer_type=request.issuer_type,
        invited_by=user_id,
        kyc_required=request.kyc_required,
    )
    return _whitelist_to_response(entry)


@router.get("/issuers/whitelist")
async def list_whitelist(
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
):
    """List all whitelisted issuer emails."""
    import logging
    log = logging.getLogger(__name__)
    try:
        entries = await issuer_service.list_whitelist()
        items = []
        for e in entries:
            items.append({
                "id": str(e.id),
                "email": e.email,
                "issuer_type": e.issuer_type.value if hasattr(e.issuer_type, "value") else (e.issuer_type or "individual"),
                "kyc_required": e.kyc_required if e.kyc_required is not None else True,
                "invited_by": str(e.invited_by) if e.invited_by else "",
                "registered_at": e.registered_at.isoformat() if e.registered_at else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            })
        return {"items": items, "total": len(items)}
    except Exception as exc:
        log.exception("Whitelist list failed: %s", exc)
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"detail": {"code": "INTERNAL", "message": str(exc)}})


@router.delete("/issuers/whitelist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_whitelist(
    entry_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> None:
    """Remove an email from the whitelist."""
    await issuer_service.remove_from_whitelist(entry_id)


# ==================== Issuer Management ====================


@router.get("/issuers", response_model=IssuerListResponse)
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


@router.get("/issuers/{issuer_id}", response_model=IssuerResponse)
async def get_issuer(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Get a single issuer by ID."""
    issuer = await issuer_service._get_issuer(issuer_id)
    return _issuer_to_response(issuer)


@router.post("/issuers", response_model=IssuerResponse, status_code=status.HTTP_201_CREATED)
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


# ==================== On-Chain Registration ====================


@router.post(
    "/issuers/{issuer_id}/register-onchain",
    response_model=OnChainRegistrationResponse,
)
async def register_issuer_onchain(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> OnChainRegistrationResponse:
    """Register and activate an issuer on the IssuerRegistry contract.

    The issuer must be ACTIVE in the database and have a wallet address.
    Calls registerIssuer() + activateIssuer() on-chain using the deployer wallet.

    Requires: platform_admin role.
    """
    from apps.api.services.web3_issuer_registry_service import Web3IssuerRegistryService

    issuer = await issuer_service._get_issuer(issuer_id)

    if issuer.status.value != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ISSUER_NOT_ACTIVE", "message": "Issuer must be active in DB before on-chain registration"},
        )

    if not issuer.wallet_address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_WALLET", "message": "Issuer has no wallet address configured"},
        )

    registry_service = Web3IssuerRegistryService()

    # Check if already registered
    try:
        already_active = await registry_service.is_active_issuer(issuer.wallet_address)
        if already_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_REGISTERED", "message": "Issuer is already registered and active on-chain"},
            )
    except ValueError:
        raise
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not check on-chain status, proceeding: %s", exc)

    try:
        tx_hash = await registry_service.register_and_activate_issuer(
            wallet_address=issuer.wallet_address,
            name=issuer.name,
            jurisdiction=issuer.jurisdiction or "",
        )
    except Exception as exc:
        logger.error("On-chain issuer registration failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "ONCHAIN_TX_FAILED", "message": f"On-chain transaction failed: {exc}"},
        ) from exc

    return OnChainRegistrationResponse(
        issuer_id=str(issuer_id),
        wallet_address=issuer.wallet_address,
        tx_hash=tx_hash,
        message="Issuer registered and activated on-chain",
    )


# ==================== Identity Override ====================


@router.post("/issuers/{issuer_id}/skip-identity", response_model=IssuerResponse)
async def skip_identity_verification(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Admin override: mark issuer identity as approved without Sumsub verification."""
    issuer = await issuer_service.set_identity_approved(issuer_id)
    return _issuer_to_response(issuer)


# ==================== Wallet Approval ====================


@router.post("/issuers/{issuer_id}/approve-wallet", response_model=IssuerResponse)
async def approve_issuer_wallet(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Approve an issuer's wallet address."""
    issuer = await issuer_service.approve_wallet(issuer_id)
    return _issuer_to_response(issuer)


@router.post("/issuers/{issuer_id}/reject-wallet", response_model=IssuerResponse)
async def reject_issuer_wallet(
    issuer_id: UUID,
    _user_id: RequireAdmin,
    issuer_service: Annotated[IssuerService, Depends(get_issuer_service)],
) -> IssuerResponse:
    """Reject an issuer's wallet address."""
    issuer = await issuer_service.reject_wallet(issuer_id)
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
        await db.execute(select(func.count(Issuer.id)).where(Issuer.status == "active"))
    ).scalar_one()
    active_sales = (
        await db.execute(select(func.count(TokenSale.id)).where(TokenSale.status == "active"))
    ).scalar_one()
    tvl = (
        await db.execute(
            select(func.coalesce(func.sum(Contribution.amount), 0)).where(
                Contribution.claimed_at.isnot(None)
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
