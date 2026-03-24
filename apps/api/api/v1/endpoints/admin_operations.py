"""Admin operations endpoints — redemptions, dividends."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.dividend_distribution import DividendDistribution
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.schemas.admin import DividendDepositRequest, RedemptionUpdateRequest
from packages.common.core.auth_deps import CurrentUserId, RequireIssuerOrAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


@router.patch("/redemptions/{redemption_id}")
async def update_redemption_status(
    redemption_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001 — role guard
    request: RedemptionUpdateRequest,
) -> dict:
    """Update redemption status (issuer action: processing, shipped, fulfilled, cancelled)."""
    result = await db.execute(
        select(RedemptionRequest).where(RedemptionRequest.id == redemption_id)
    )
    req = result.scalar_one_or_none()
    if not req:
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
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001 — role guard
    status_filter: str | None = None,
) -> dict:
    """List all redemption requests (issuer view)."""
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
    """Record a dividend deposit for a token (issuer action).

    The issuer has already called DividendDistributor.deposit() on-chain.
    This records the epoch in the DB for tracking and querying.
    """
    from decimal import Decimal

    from apps.api.services.dividend_service import DividendService

    svc = DividendService(db)
    dist = await svc.deposit_dividend(
        user_id=user_id,
        token_id=UUID(request.token_id) if isinstance(request.token_id, str) else request.token_id,
        amount_usdc=Decimal(str(request.amount_usdc)),
        tx_hash=getattr(request, "tx_hash", None),
    )
    return {"message": "Dividend deposit recorded", "id": str(dist.id), "amount_usdc": str(dist.total_amount)}


@router.post("/dividends/{token_id}/deposit")
async def deposit_dividend_by_token(
    token_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId,
    request: DividendDepositRequest,
) -> dict:
    """Record a dividend deposit for a specific token (issuer action).

    Path-based alternative to POST /dividends/deposit.
    """
    from decimal import Decimal

    from apps.api.services.dividend_service import DividendService

    svc = DividendService(db)
    dist = await svc.deposit_dividend(
        user_id=user_id,
        token_id=token_id,
        amount_usdc=Decimal(str(request.amount_usdc)),
        tx_hash=getattr(request, "tx_hash", None),
    )
    return {"message": "Dividend deposit recorded", "id": str(dist.id), "amount_usdc": str(dist.total_amount)}


@router.post("/webhooks/{webhook_id}/replay")
async def replay_webhook(
    webhook_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001 — role guard
) -> dict:
    """Re-process a failed webhook event (admin action)."""
    from apps.api.models.webhook_event import WebhookEvent

    result = await db.execute(select(WebhookEvent).where(WebhookEvent.id == webhook_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Webhook event not found")
    if event.status == "processed":
        return {"message": "Webhook already processed", "id": str(event.id)}

    # Reset for retry
    event.status = "pending"
    event.attempts = 0
    event.last_error = None
    await db.commit()
    return {"message": "Webhook queued for replay", "id": str(event.id)}


@router.get("/webhooks")
async def list_webhooks(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001 — role guard
    status_filter: str | None = None,
) -> dict:
    """List webhook events (admin view)."""
    from apps.api.models.webhook_event import WebhookEvent

    q = select(WebhookEvent).order_by(WebhookEvent.created_at.desc()).limit(100)
    if status_filter:
        q = q.where(WebhookEvent.status == status_filter)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "webhooks": [
            {
                "id": str(e.id),
                "provider": e.provider,
                "status": e.status,
                "attempts": e.attempts,
                "last_error": e.last_error,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "processed_at": e.processed_at.isoformat() if e.processed_at else None,
            }
            for e in items
        ],
        "total": len(items),
    }


@router.get("/dividends")
async def list_dividends(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: RequireIssuerOrAdmin,  # noqa: ARG001 — role guard
    token_id: UUID | None = None,
) -> dict:
    """List dividend distributions (issuer view)."""
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
