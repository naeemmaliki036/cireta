"""Admin compliance endpoints — freeze, unfreeze, forced-transfer, recover, pause."""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
from apps.api.schemas.admin import (
    AuditLogListResponse,
    AuditLogResponse,
    ComplianceActionResponse,
    ForcedTransferRequest,
    ForceTransferERC3643Request,
    FreezeRequest,
    FrozenAddressInfo,
    FrozenAddressListResponse,
    RecoverFractionsRequest,
    RecoverRequest,
    RecoveryResponse,
    UnfreezeRequest,
)
from apps.api.services.compliance_service import ComplianceService
from apps.api.services.recovery_service import RecoveryService
from packages.common.core.auth_deps import RequireIssuerOrAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request using trusted proxy connection info."""
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
    user_id: RequireIssuerOrAdmin,
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
    user_id: RequireIssuerOrAdmin,
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
    user_id: RequireIssuerOrAdmin,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Record a forced token transfer executed via dApp.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.forced_transfer(
        actor_id=user_id,
        from_address=request_data.from_address,
        to_address=request_data.to_address,
        token_id=UUID(request_data.token_id),
        amount=request_data.amount,
        reason=request_data.reason,
        tx_hash=request_data.tx_hash,
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
    user_id: RequireIssuerOrAdmin,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
) -> ComplianceActionResponse:
    """Record a token recovery executed via dApp.

    The contract's recoveryAddress() transfers full balance + frozen
    status from lostWallet to newWallet.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.recover_tokens(
        actor_id=user_id,
        from_address=request_data.from_address,
        token_id=UUID(request_data.token_id),
        amount=request_data.amount,
        reason=request_data.reason,
        to_address=request_data.to_address,
        tx_hash=request_data.tx_hash,
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
    user_id: RequireIssuerOrAdmin,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
    reason: str = Query(..., min_length=1),
    tx_hash: str | None = Query(None),
) -> ComplianceActionResponse:
    """Record a token pause executed via dApp.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.pause_token(
        actor_id=user_id,
        token_id=token_id,
        reason=reason,
        tx_hash=tx_hash,
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
    user_id: RequireIssuerOrAdmin,
    compliance_service: Annotated[ComplianceService, Depends(get_compliance_service)],
    reason: str = Query(..., min_length=1),
    tx_hash: str | None = Query(None),
) -> ComplianceActionResponse:
    """Record a token unpause executed via dApp.

    Requires: issuer role (must own the token).
    """
    audit = await compliance_service.unpause_token(
        actor_id=user_id,
        token_id=token_id,
        reason=reason,
        tx_hash=tx_hash,
        ip_address=_get_client_ip(http_request),
    )

    return ComplianceActionResponse(
        action="unpause",
        target=str(token_id),
        audit_log_id=str(audit.id),
    )


@router.get("/compliance/audit-logs/actions", response_model=list[str])
async def list_audit_log_actions(
    _user_id: RequireIssuerOrAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    """Return the distinct action values present in audit_logs, sorted alphabetically.

    Intended for the frontend to populate an action-filter dropdown without
    hard-coding action strings in the UI.
    """
    from sqlalchemy import distinct

    rows = (
        await db.execute(
            select(distinct(AuditLog.action)).order_by(AuditLog.action)
        )
    ).scalars().all()
    return list(rows)


@router.get("/compliance/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001
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
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> FrozenAddressListResponse:
    """Return addresses that are currently frozen (freeze without matching unfreeze)."""
    freeze_q = (
        select(AuditLog).where(AuditLog.action == "freeze").order_by(AuditLog.created_at.desc())
    )
    unfreeze_q = select(AuditLog).where(AuditLog.action == "unfreeze")

    frozen_rows = (await db.execute(freeze_q)).scalars().all()
    unfrozen_rows = (await db.execute(unfreeze_q)).scalars().all()

    unfrozen_targets = {
        (r.target_id, str(r.payload.get("token_id") if r.payload else None)) for r in unfrozen_rows
    }

    items: list[FrozenAddressInfo] = []
    seen: set[tuple[str, str | None]] = set()
    for r in frozen_rows:
        token_id = (
            str(r.payload.get("token_id")) if r.payload and r.payload.get("token_id") else None
        )
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


@router.get("/compliance/recovery-logs")
async def list_recovery_logs(
    user_id: RequireIssuerOrAdmin,
    db: AsyncSession = Depends(get_db),
    token_id: str | None = None,
) -> list[dict]:
    """List token recovery actions (audit trail) scoped to issuer's tokens (admins see all)."""
    from sqlalchemy import select

    from apps.api.models.audit_log import AuditLog
    from apps.api.models.token import Token
    from apps.api.models.user import User

    # Determine if caller is admin or issuer
    result = await db.execute(select(User).where(User.id == user_id))
    actor = result.scalar_one_or_none()
    is_admin = actor and actor.role == "admin" if actor else False

    query = select(AuditLog).where(AuditLog.action == "recover_tokens")

    if token_id:
        query = query.where(AuditLog.target_id == token_id)

    # Non-admin issuers: restrict to their own tokens
    if not is_admin and actor and actor.issuer:
        token_result = await db.execute(select(Token.id).where(Token.issuer_id == actor.issuer.id))
        owned_token_ids = [str(t) for t in token_result.scalars().all()]
        if owned_token_ids:
            query = query.where(AuditLog.target_id.in_(owned_token_ids))
        else:
            return []
    elif not is_admin:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Issuer access required")

    query = query.order_by(AuditLog.created_at.desc()).limit(100)

    logs = (await db.execute(query)).scalars().all()
    return [
        {
            "id": str(log.id),
            "action": log.action,
            "target_id": log.target_id,
            "payload": log.payload,
            "reason": log.reason,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


# ── Recovery endpoints (ERC-1155 fractions + ERC-3643 cross-user) ──────


@router.post("/compliance/recover-fractions", response_model=RecoveryResponse)
async def recover_fractions(
    body: RecoverFractionsRequest,
    user_id: RequireIssuerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> RecoveryResponse:
    """Force-transfer ERC-1155 fraction tokens between any wallets.

    Supports cross-user transfers (inheritance, court orders, compliance).
    Caller must have RECOVERY_ROLE on the fraction token contract.
    """
    if body.fraction_id not in (1, 2):
        raise HTTPException(status_code=422, detail="fraction_id must be 1 or 2")

    svc = RecoveryService(db)
    try:
        log = await svc.recover_fractions(
            sale_id=UUID(body.sale_id),
            from_address=body.from_address,
            to_address=body.to_address,
            fraction_id=body.fraction_id,
            amount=int(body.amount),
            reason=body.reason,
            admin_id=user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as exc:
        logger.exception("Fraction recovery failed")
        raise HTTPException(status_code=500, detail="On-chain recovery failed") from exc

    from_email = None
    to_email = None
    if log.from_user_id:
        from apps.api.models.user import User

        u = (await db.execute(select(User).where(User.id == log.from_user_id))).scalar_one_or_none()
        from_email = u.email if u else None
    if log.to_user_id:
        from apps.api.models.user import User

        u = (await db.execute(select(User).where(User.id == log.to_user_id))).scalar_one_or_none()
        to_email = u.email if u else None

    return RecoveryResponse(
        recovery_log_id=str(log.id),
        tx_hash=log.tx_hash or "",
        token_type=log.token_type,
        from_address=log.lost_wallet,
        to_address=log.new_wallet,
        amount=str(log.amount),
        from_user_email=from_email,
        to_user_email=to_email,
    )


@router.post("/compliance/force-transfer-erc3643", response_model=RecoveryResponse)
async def force_transfer_erc3643(
    body: ForceTransferERC3643Request,
    user_id: RequireIssuerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> RecoveryResponse:
    """Cross-user force-transfer of ERC-3643 project tokens.

    Unlike recoveryAddress (same-user wallet swap), this transfers a specific
    amount between wallets belonging to different users. Used for inheritance,
    court orders, compliance seizure.
    """
    svc = RecoveryService(db)
    try:
        log = await svc.force_transfer_erc3643(
            token_id=UUID(body.token_id),
            from_address=body.from_address,
            to_address=body.to_address,
            amount=int(body.amount),
            reason=body.reason,
            admin_id=user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as exc:
        logger.exception("ERC-3643 force transfer failed")
        raise HTTPException(status_code=500, detail="On-chain force transfer failed") from exc

    from_email = None
    to_email = None
    if log.from_user_id:
        from apps.api.models.user import User

        u = (await db.execute(select(User).where(User.id == log.from_user_id))).scalar_one_or_none()
        from_email = u.email if u else None
    if log.to_user_id:
        from apps.api.models.user import User

        u = (await db.execute(select(User).where(User.id == log.to_user_id))).scalar_one_or_none()
        to_email = u.email if u else None

    return RecoveryResponse(
        recovery_log_id=str(log.id),
        tx_hash=log.tx_hash or "",
        token_type=log.token_type,
        from_address=log.lost_wallet,
        to_address=log.new_wallet,
        amount=str(log.amount),
        from_user_email=from_email,
        to_user_email=to_email,
    )
