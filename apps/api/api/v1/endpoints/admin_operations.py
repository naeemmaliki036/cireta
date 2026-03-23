"""Admin operations endpoints — redemptions, dividends."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.dividend_distribution import DividendDistribution
from apps.api.models.issuer import Issuer
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
    result = await db.execute(select(RedemptionRequest).where(RedemptionRequest.id == redemption_id))
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
    """Record a dividend deposit for a token (issuer action)."""
    issuer_result = await db.execute(select(Issuer).where(Issuer.user_id == user_id))
    issuer = issuer_result.scalar_one_or_none()
    if not issuer:
        raise HTTPException(status_code=403, detail="Issuer access required")

    dist = DividendDistribution()
    dist.token_id = request.token_id
    dist.epoch_index = 0
    dist.total_amount = request.amount_usdc
    dist.total_supply_snapshot = 0
    dist.contract_address = request.contract_address
    db.add(dist)
    await db.commit()
    return {"message": "Dividend deposit recorded", "amount_usdc": str(request.amount_usdc)}


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
