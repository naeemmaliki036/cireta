"""Admin compliance endpoints — freeze, unfreeze, forced-transfer, recover, pause."""

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
    ForcedTransferRequest,
    FreezeRequest,
    FrozenAddressInfo,
    FrozenAddressListResponse,
    RecoverRequest,
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
