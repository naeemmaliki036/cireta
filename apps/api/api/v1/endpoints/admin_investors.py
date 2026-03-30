"""Admin investors endpoint — list users with investor role."""

from __future__ import annotations

from datetime import datetime

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import UserRole
from apps.api.models.user import User
from packages.common.core.auth_deps import RequireAdmin, RequireIssuerOrAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


class InvestorResponse(BaseModel):
    id: str
    email: str
    kyc_status: str
    kyc_level: int
    onchain_id: str | None
    wallet_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class InvestorListResponse(BaseModel):
    items: list[InvestorResponse]
    total: int
    page: int
    size: int


@router.get("/investors/", response_model=InvestorListResponse)
async def list_investors(
    _user_id: RequireIssuerOrAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    kyc_status: str | None = Query(None),
) -> InvestorListResponse:
    """List all investor accounts with optional KYC status filter."""
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import UserRole

    offset = (page - 1) * size
    q = (
        select(User)
        .where(User.role == UserRole.INVESTOR)
        .options(selectinload(User.wallets))
        .order_by(User.created_at.desc())
    )
    if kyc_status:
        q = q.where(User.kyc_status == kyc_status)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).scalars().all()

    items = [
        InvestorResponse(
            id=str(u.id),
            email=u.email,
            kyc_status=u.kyc_status.value if hasattr(u.kyc_status, "value") else str(u.kyc_status),
            kyc_level=u.kyc_level,
            onchain_id=u.onchain_id,
            wallet_address=(u.wallets[0].address[:6] + "…" + u.wallets[0].address[-4:])
            if u.wallets and u.wallets[0].address and len(u.wallets[0].address) > 10
            else (u.wallets[0].address if u.wallets else None),
            created_at=u.created_at,
        )
        for u in rows
    ]
    return InvestorListResponse(items=items, total=total, page=page, size=size)


# ==================== Admin Account Management ====================


class AdminAccountResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    is_super_admin: bool
    created_at: datetime


class AdminListResponse(BaseModel):
    items: list[AdminAccountResponse]
    total: int


class CreateAdminRequest(BaseModel):
    email: str
    display_name: str | None = None


@router.get("/admins/", response_model=AdminListResponse)
async def list_admins(
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminListResponse:
    """List all admin accounts."""
    # Only super admins can see admin list
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can manage admin accounts"})

    result = await db.execute(select(User).where(User.role == UserRole.ADMIN).order_by(User.created_at))
    admins = list(result.scalars().all())
    return AdminListResponse(
        items=[AdminAccountResponse(
            id=str(a.id), email=a.email, display_name=a.display_name,
            role="admin", is_super_admin=a.is_super_admin, created_at=a.created_at,
        ) for a in admins],
        total=len(admins),
    )


@router.post("/admins/", response_model=AdminAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    request: CreateAdminRequest,
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminAccountResponse:
    """Create a new admin account. Super admin only.

    Creates a passwordless admin — they log in via OTP.
    """
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can create admin accounts"})

    # Check email not taken
    existing = await db.execute(select(User).where(User.email == request.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "EMAIL_EXISTS", "message": "Email already registered"})

    user = User()
    user.email = request.email.lower()
    user.display_name = request.display_name or request.email.split("@")[0]
    user.role = UserRole.ADMIN
    user.email_verified = True
    from datetime import UTC, datetime as dt
    user.email_verified_at = dt.now(UTC)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return AdminAccountResponse(
        id=str(user.id), email=user.email, display_name=user.display_name,
        role="admin", is_super_admin=False, created_at=user.created_at,
    )


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_admin(
    admin_id: UUID,
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove admin role (demote to investor). Super admin only. Cannot remove self or other super admins."""
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=403, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can remove admins"})

    if admin_id == user_id:
        raise HTTPException(status_code=400, detail={"code": "CANNOT_REMOVE_SELF", "message": "Cannot remove yourself"})

    target = await db.execute(select(User).where(User.id == admin_id))
    target_user = target.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    if target_user.is_super_admin:
        raise HTTPException(status_code=400, detail={"code": "CANNOT_REMOVE_SUPER", "message": "Cannot remove a super admin"})

    target_user.role = UserRole.INVESTOR
    await db.commit()
