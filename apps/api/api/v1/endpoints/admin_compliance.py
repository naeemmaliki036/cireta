"""Admin compliance endpoints — freeze, unfreeze, forced-transfer, recover, pause."""

from datetime import UTC
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
from apps.api.schemas.admin import (
    AuditLogListResponse,
    AuditLogResponse,
    ComplianceActionResponse,
    DividendDepositRequest,
    ForcedTransferRequest,
    FreezeRequest,
    FrozenAddressInfo,
    FrozenAddressListResponse,
    RecoverRequest,
    RedemptionUpdateRequest,
    UnfreezeRequest,
)
from apps.api.services.compliance_service import ComplianceService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None



async def get_compliance_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ComplianceService:
    """Get compliance service instance."""
    return ComplianceService(db)



@router.post("/compliance/freeze", response_model=ComplianceActionResponse)
async def freeze_address(
    request_data: FreezeRequest,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Freeze a wallet address.

    Requires: issuer or admin role.
    """
    audit = await compliance_service.freeze_address(
        actor_id=user_id,
        wallet_address=request_data.wallet_address,
        token_id=UUID(request_data.token_id) if request_data.token_id else None,
        reason=request_data.reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="freeze",
        target=request_data.wallet_address,
        audit_log_id=str(audit.id),
    )


@router.post("/compliance/unfreeze", response_model=ComplianceActionResponse)
async def unfreeze_address(
    request_data: UnfreezeRequest,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Unfreeze a wallet address.

    Requires: issuer or admin role.
    """
    audit = await compliance_service.unfreeze_address(
        actor_id=user_id,
        wallet_address=request_data.wallet_address,
        token_id=UUID(request_data.token_id) if request_data.token_id else None,
        reason=request_data.reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="unfreeze",
        target=request_data.wallet_address,
        audit_log_id=str(audit.id),
    )


@router.post("/compliance/forced-transfer", response_model=ComplianceActionResponse)
async def forced_transfer(
    request_data: ForcedTransferRequest,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Execute a forced token transfer.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.forced_transfer(
        actor_id=user_id,
        from_address=request_data.from_address,
        to_address=request_data.to_address,
        token_id=UUID(request_data.token_id),
        amount=request_data.amount,
        reason=request_data.reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="forced_transfer",
        target=request_data.token_id,
        audit_log_id=str(audit.id),
    )


@router.post("/compliance/recover", response_model=ComplianceActionResponse)
async def recover_tokens(
    request_data: RecoverRequest,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Recover tokens from an address.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.recover_tokens(
        actor_id=user_id,
        from_address=request_data.from_address,
        token_id=UUID(request_data.token_id),
        amount=request_data.amount,
        reason=request_data.reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="recover",
        target=request_data.token_id,
        audit_log_id=str(audit.id),
    )


@router.post("/compliance/pause/{token_id}", response_model=ComplianceActionResponse)
async def pause_token(
    token_id: UUID,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
    reason: str = Query(..., min_length=1),
) -> ComplianceActionResponse:
    """Pause all transfers for a token.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.pause_token(
        actor_id=user_id,
        token_id=token_id,
        reason=reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="pause",
        target=str(token_id),
        audit_log_id=str(audit.id),
    )


@router.post("/compliance/unpause/{token_id}", response_model=ComplianceActionResponse)
async def unpause_token(
    token_id: UUID,
    http_request: Request,
    user_id: CurrentUserId,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
    reason: str = Query(..., min_length=1),
) -> ComplianceActionResponse:
    """Unpause transfers for a token.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.unpause_token(
        actor_id=user_id,
        token_id=token_id,
        reason=reason,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="unpause",
        target=str(token_id),
        audit_log_id=str(audit.id),
    )





@router.get("/compliance/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    user_id: CurrentUserId,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    action: str | None = Query(None),
) -> AuditLogListResponse:
    """List compliance audit log entries, newest first."""
    offset = (page - 1) * size
    q = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.where(AuditLog.action == action)
    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).scalars().all()
    items = [
        AuditLogResponse(
            id=str(r.id),
            actor_id=str(r.actor_id) if r.actor_id else None,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            reason=r.reason,
            ip_address=r.ip_address,
            payload=r.payload,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return AuditLogListResponse(items=items, total=total, page=page, size=size)


@router.get("/compliance/frozen", response_model=FrozenAddressListResponse)
async def list_frozen_addresses(
    user_id: CurrentUserId,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> FrozenAddressListResponse:
    """Return addresses that are currently frozen (freeze without matching unfreeze)."""
    freeze_q = (
        select(AuditLog)
        .where(AuditLog.action == "freeze")
        .order_by(AuditLog.created_at.desc())
    )
    unfreeze_q = select(AuditLog).where(AuditLog.action == "unfreeze")

    frozen_rows = (await db.execute(freeze_q)).scalars().all()
    unfrozen_rows = (await db.execute(unfreeze_q)).scalars().all()

    unfrozen_targets = {
        (r.target_id, str(r.payload.get("token_id") if r.payload else None))
        for r in unfrozen_rows
    }

    items: list[FrozenAddressInfo] = []
    seen: set[tuple[str, str | None]] = set()
    for r in frozen_rows:
        token_id = str(r.payload.get("token_id")) if r.payload and r.payload.get("token_id") else None
        key = (r.target_id, token_id)
        if key not in seen and key not in unfrozen_targets:
            seen.add(key)
            items.append(
                FrozenAddressInfo(
                    wallet_address=r.target_id,
                    token_id=token_id,
                    reason=r.reason or "",
                    frozen_at=r.created_at,
                    audit_log_id=str(r.id),
                )
            )

    return FrozenAddressListResponse(items=items, total=len(items))


@router.patch("/redemptions/{redemption_id}")
async def update_redemption_status(
    redemption_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId,  # noqa: ARG001 — auth guard
    request: RedemptionUpdateRequest,
) -> dict:
    """Update redemption status (issuer action: processing, shipped, fulfilled, cancelled)."""
    from datetime import datetime

    from sqlalchemy import select

    from apps.api.models.redemption_request import RedemptionRequest
    result = await db.execute(select(RedemptionRequest).where(RedemptionRequest.id == redemption_id))
    req = result.scalar_one_or_none()
    if not req:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Redemption request not found")
    req.status = request.status
    if request.status == "shipped":
        req.shipped_at = datetime.now(UTC)
    if request.status == "fulfilled":
        req.fulfilled_at = datetime.now(UTC)
    if request.notes:
        req.notes = request.notes
    await db.commit()
    return {"message": "Redemption status updated", "status": request.status}


@router.get("/redemptions")
async def list_redemptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId,  # noqa: ARG001 — auth guard
    status_filter: str | None = None,
) -> dict:
    """List all redemption requests (issuer view)."""
    from sqlalchemy import select

    from apps.api.models.redemption_request import RedemptionRequest
    q = select(RedemptionRequest).order_by(RedemptionRequest.created_at.desc())
    if status_filter:
        q = q.where(RedemptionRequest.status == status_filter)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "redemptions": [
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "token_id": str(r.token_id),
                "amount": str(r.amount),
                "status": r.status if isinstance(r.status, str) else r.status.value,
                "delivery_name": r.delivery_name,
                "delivery_address": r.delivery_address,
                "delivery_phone": r.delivery_phone,
                "tx_hash": r.tx_hash,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in items
        ],
        "total": len(items),
    }


@router.post("/dividends/deposit")
async def deposit_dividend(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId,
    request: DividendDepositRequest,
) -> dict:
    """Record a dividend deposit for a token (issuer action)."""
    from sqlalchemy import select

    from apps.api.models.issuer import Issuer
    issuer_result = await db.execute(select(Issuer).where(Issuer.user_id == user_id))
    issuer = issuer_result.scalar_one_or_none()
    if not issuer:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Issuer access required")

    # In production, this triggers DividendDistributor.deposit() on-chain.
    # For now, record in DB.
    from apps.api.models.dividend_distribution import DividendDistribution
    dist = DividendDistribution()
    dist.token_id = request.token_id
    dist.epoch_index = 0  # incremented by contract
    dist.total_amount = request.amount_usdc
    dist.total_supply_snapshot = 0
    dist.contract_address = request.contract_address
    db.add(dist)
    await db.commit()
    return {"message": "Dividend deposit recorded", "amount_usdc": str(request.amount_usdc)}


@router.get("/dividends")
async def list_dividends(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId,  # noqa: ARG001 — auth guard
    token_id: UUID | None = None,
) -> dict:
    """List dividend distributions (issuer view)."""
    from sqlalchemy import select

    from apps.api.models.dividend_distribution import DividendDistribution
    q = select(DividendDistribution).order_by(DividendDistribution.created_at.desc())
    if token_id:
        q = q.where(DividendDistribution.token_id == token_id)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "distributions": [
            {
                "id": str(d.id),
                "token_id": str(d.token_id),
                "epoch_index": d.epoch_index,
                "total_amount": str(d.total_amount),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in items
        ],
        "total": len(items),
    }
