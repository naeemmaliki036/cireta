"""Issuer withdrawal endpoints — withdraw raised funds from finalized sales."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from apps.api.models.token_sale import TokenSale
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/issuer/withdrawals", tags=["issuer"])  # mounted under /api/v1 by router.py


class WithdrawalSummary(BaseModel):
    available: str
    pending: str
    total_withdrawn: str


class WithdrawalRecord(BaseModel):
    id: str
    sale_id: str
    sale_name: str | None
    amount: str
    token: str
    status: str
    tx_hash: str | None
    requested_at: datetime
    completed_at: datetime | None


class WithdrawalListResponse(BaseModel):
    summary: WithdrawalSummary
    items: list[WithdrawalRecord]
    total: int


async def _get_issuer(user_id: str, db: AsyncSession) -> Issuer:
    row = (await db.execute(select(Issuer).where(Issuer.user_id == UUID(user_id)))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an issuer")
    return row


@router.get("/", response_model=WithdrawalListResponse)
async def list_withdrawals(
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> WithdrawalListResponse:
    """Return withdrawal summary and history for the issuer's finalized sales."""
    issuer = await _get_issuer(user_id, db)

    q = select(TokenSale).where(
        TokenSale.issuer_id == issuer.id,
        TokenSale.status == "finalized",
    )
    sales = (await db.execute(q)).scalars().all()

    total_raised = sum(s.total_raised for s in sales)
    records = [
        WithdrawalRecord(
            id=str(s.id),
            sale_id=str(s.id),
            sale_name=None,
            amount=str(s.total_raised),
            token="USDC",
            status="available",
            tx_hash=None,
            requested_at=s.created_at,
            completed_at=None,
        )
        for s in sales
    ]

    return WithdrawalListResponse(
        summary=WithdrawalSummary(
            available=str(total_raised),
            pending="0",
            total_withdrawn="0",
        ),
        items=records,
        total=len(records),
    )
