"""Payment tokens endpoint — list accepted stablecoins for sale creation."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.payment_token import PaymentToken
from apps.api.schemas.payment_token import (
    PaymentTokenCreate,
    PaymentTokenListResponse,
    PaymentTokenResponse,
    PaymentTokenUpdate,
)
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["payment-tokens"])


def _to_response(pt: PaymentToken) -> PaymentTokenResponse:
    return PaymentTokenResponse(
        id=str(pt.id),
        address=pt.address,
        symbol=pt.symbol,
        name=pt.name,
        chain_id=pt.chain_id,
        decimals=pt.decimals,
        sort_order=pt.sort_order,
        is_active=pt.is_active,
    )


@router.get("/payment-tokens", response_model=PaymentTokenListResponse)
async def list_payment_tokens(
    db: Annotated[AsyncSession, Depends(get_db)],
    chain_id: int | None = None,
    active_only: bool = True,
) -> PaymentTokenListResponse:
    """Public list of accepted payment tokens.

    Filters by chain when provided. Used by the sale-creation form to populate
    the payment-token dropdown without hardcoding addresses in the frontend.
    """
    stmt = select(PaymentToken).order_by(PaymentToken.sort_order, PaymentToken.symbol)
    if chain_id is not None:
        stmt = stmt.where(PaymentToken.chain_id == chain_id)
    if active_only:
        stmt = stmt.where(PaymentToken.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return PaymentTokenListResponse(items=[_to_response(r) for r in rows])


# ---------------------------------------------------------------------------
# Admin CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/payment-tokens",
    response_model=PaymentTokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RequireAdmin)],
)
async def create_payment_token(
    payload: PaymentTokenCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentTokenResponse:
    existing = (
        await db.execute(select(PaymentToken).where(PaymentToken.address == payload.address))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PAYMENT_TOKEN_EXISTS", "message": "Address already registered"},
        )
    pt = PaymentToken(**payload.model_dump())
    db.add(pt)
    await db.commit()
    await db.refresh(pt)
    return _to_response(pt)


@router.patch(
    "/payment-tokens/{token_id}",
    response_model=PaymentTokenResponse,
    dependencies=[Depends(RequireAdmin)],
)
async def update_payment_token(
    token_id: UUID,
    payload: PaymentTokenUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentTokenResponse:
    pt = (
        await db.execute(select(PaymentToken).where(PaymentToken.id == token_id))
    ).scalar_one_or_none()
    if not pt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PAYMENT_TOKEN_NOT_FOUND", "message": "Not found"},
        )
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pt, k, v)
    await db.commit()
    await db.refresh(pt)
    return _to_response(pt)


@router.delete(
    "/payment-tokens/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RequireAdmin)],
)
async def delete_payment_token(
    token_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    pt = (
        await db.execute(select(PaymentToken).where(PaymentToken.id == token_id))
    ).scalar_one_or_none()
    if not pt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PAYMENT_TOKEN_NOT_FOUND", "message": "Not found"},
        )
    await db.delete(pt)
    await db.commit()
