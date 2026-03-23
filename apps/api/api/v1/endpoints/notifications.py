"""Notification endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.notification import Notification
from apps.api.schemas.notification import (
    NotificationListResponse,
    NotificationPreferences,
    NotificationResponse,
    UnreadCountResponse,
)
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(n.id),
        type=n.type,
        title=n.title,
        message=n.message,
        data=n.data,
        read=n.read,
        created_at=n.created_at.isoformat() if n.created_at else "",
    )


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
) -> NotificationListResponse:
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.read.is_(False))
    q = q.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    notifications = list(result.scalars().all())

    # Count unread
    count_result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
    )
    unread_count = count_result.scalar() or 0

    return NotificationListResponse(
        notifications=[_to_response(n) for n in notifications],
        total=len(notifications),
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UnreadCountResponse:
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
    )
    return UnreadCountResponse(count=result.scalar() or 0)


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(read=True)
    )
    await db.commit()
    return {"message": "Marked as read"}


@router.patch("/read-all")
async def mark_all_read(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    await db.execute(update(Notification).where(Notification.user_id == user_id).values(read=True))
    await db.commit()
    return {"message": "All marked as read"}


@router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(
    user_id: CurrentUserId, db: AsyncSession = Depends(get_db)
) -> NotificationPreferences:
    """Get notification preferences for the current user (persisted in DB)."""
    from apps.api.models.notification_preferences import NotificationPreferences as NPModel

    result = await db.execute(select(NPModel).where(NPModel.user_id == user_id))
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = NPModel(user_id=user_id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return NotificationPreferences(
        email_investment_updates=prefs.email_investment_updates,
        email_kyc_status=prefs.email_kyc_status,
        email_sale_announcements=prefs.email_sale_announcements,
        email_dividends=prefs.email_dividends,
        inapp_investment_updates=prefs.inapp_investment_updates,
        inapp_kyc_status=prefs.inapp_kyc_status,
        inapp_sale_announcements=prefs.inapp_sale_announcements,
        inapp_dividends=prefs.inapp_dividends,
    )


@router.patch("/preferences", response_model=NotificationPreferences)
async def update_preferences(
    prefs: NotificationPreferences,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPreferences:
    from apps.api.models.notification_preferences import NotificationPreferences as NPModel

    result = await db.execute(select(NPModel).where(NPModel.user_id == user_id))
    prefs_model = result.scalar_one_or_none()
    if not prefs_model:
        prefs_model = NPModel(user_id=user_id)
        db.add(prefs_model)
    for key, val in prefs.model_dump().items():
        if hasattr(prefs_model, key):
            setattr(prefs_model, key, val)
    await db.commit()
    return prefs
