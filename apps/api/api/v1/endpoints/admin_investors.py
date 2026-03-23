"""Admin investors endpoint — list users with investor role."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User
from packages.common.core.auth_deps import RequireIssuerOrAdmin
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
