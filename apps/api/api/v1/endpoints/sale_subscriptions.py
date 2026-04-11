"""Sale subscription endpoints — "Notify Me" for coming-soon sales."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.sale_subscription import SaleSubscription
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from packages.common.core.auth_deps import CurrentUserId, RequireIssuerOrAdmin
from packages.common.db.session import get_db

router = APIRouter(prefix="/sales/{sale_id}", tags=["sale-subscriptions"])


# --- Schemas ---

class SubscribeRequest(BaseModel):
    email: str | None = None  # Optional — auto-filled for logged-in users
    display_name: str | None = None


class SubscriptionResponse(BaseModel):
    id: str
    sale_id: str
    email: str
    display_name: str | None
    subscribed_at: str
    notified_at: str | None = None


class SubscriberCountResponse(BaseModel):
    count: int


class SubscriberListResponse(BaseModel):
    items: list[SubscriptionResponse]
    total: int


# --- Endpoints ---

@router.post("/subscribe", response_model=SubscriptionResponse, status_code=201)
async def subscribe(
    sale_id: UUID,
    request: SubscribeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUserId | None = None,
) -> SubscriptionResponse:
    """Subscribe to sale launch notifications. Auth optional — logged-in users auto-fill email."""
    # Determine email
    email = None
    display_name = request.display_name

    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            email = user.email
            display_name = display_name or user.display_name

    if not email:
        email = request.email

    if not email:
        raise HTTPException(status_code=400, detail={"code": "EMAIL_REQUIRED", "message": "Email is required"})

    email = email.lower().strip()

    # Check sale exists
    sale_result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id))
    if not sale_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    # Check if already subscribed
    existing = await db.execute(
        select(SaleSubscription).where(
            SaleSubscription.sale_id == sale_id,
            SaleSubscription.email == email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"code": "ALREADY_SUBSCRIBED", "message": "Already subscribed to this sale"})

    sub = SaleSubscription()
    sub.sale_id = sale_id
    sub.user_id = user_id
    sub.email = email
    sub.display_name = display_name

    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    return SubscriptionResponse(
        id=str(sub.id),
        sale_id=str(sub.sale_id),
        email=sub.email,
        display_name=sub.display_name,
        subscribed_at=sub.created_at.isoformat(),
    )


@router.delete("/unsubscribe")
async def unsubscribe(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Unsubscribe from sale notifications."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sub_result = await db.execute(
        select(SaleSubscription).where(
            SaleSubscription.sale_id == sale_id,
            SaleSubscription.email == user.email,
        )
    )
    sub = sub_result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Not subscribed")

    await db.delete(sub)
    await db.commit()
    return {"status": "unsubscribed"}


@router.get("/subscriber-count", response_model=SubscriberCountResponse)
async def get_subscriber_count(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriberCountResponse:
    """Get public subscriber count for a sale."""
    result = await db.execute(
        select(func.count()).select_from(SaleSubscription).where(SaleSubscription.sale_id == sale_id)
    )
    count = result.scalar() or 0
    return SubscriberCountResponse(count=count)


@router.get("/subscribers", response_model=SubscriberListResponse)
async def list_subscribers(
    sale_id: UUID,
    _user_id: RequireIssuerOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriberListResponse:
    """List all subscribers for a sale. Issuer/Admin only."""
    result = await db.execute(
        select(SaleSubscription)
        .where(SaleSubscription.sale_id == sale_id)
        .order_by(SaleSubscription.created_at.desc())
    )
    subs = result.scalars().all()
    return SubscriberListResponse(
        items=[
            SubscriptionResponse(
                id=str(s.id),
                sale_id=str(s.sale_id),
                email=s.email,
                display_name=s.display_name,
                subscribed_at=s.created_at.isoformat(),
                notified_at=s.notified_at.isoformat() if s.notified_at else None,
            )
            for s in subs
        ],
        total=len(subs),
    )


@router.post("/notify-subscribers")
async def notify_subscribers(
    sale_id: UUID,
    _user_id: RequireIssuerOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Send launch notification to all subscribers who haven't been notified yet. Issuer/Admin only."""
    from datetime import UTC, datetime

    from apps.api.services.email_service import EmailService

    # Get sale
    sale_result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id))
    sale = sale_result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    # Get un-notified subscribers
    result = await db.execute(
        select(SaleSubscription).where(
            SaleSubscription.sale_id == sale_id,
            SaleSubscription.notified_at.is_(None),
        )
    )
    subs = list(result.scalars().all())

    if not subs:
        return {"notified": 0, "message": "No pending subscribers to notify"}

    email_svc = EmailService(db)
    notified = 0
    for sub in subs:
        try:
            await email_svc.send(
                "sale_launched",
                sub.email,
                {
                    "sale_name": sale.title or "New Sale",
                    "display_name": sub.display_name or sub.email.split("@")[0],
                },
            )
            sub.notified_at = datetime.now(UTC)
            notified += 1
        except Exception:
            pass  # Don't block on individual email failures

    await db.commit()
    return {"notified": notified, "total": len(subs), "message": f"Notified {notified} subscriber(s)"}


@router.get("/is-subscribed")
async def check_subscribed(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Check if the current user is subscribed to a sale."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"subscribed": False}

    sub = await db.execute(
        select(SaleSubscription).where(
            SaleSubscription.sale_id == sale_id,
            SaleSubscription.email == user.email,
        )
    )
    return {"subscribed": sub.scalar_one_or_none() is not None}
