"""Per-user shipping address book — CRUD endpoints for physical
redemption deliveries. Every endpoint is scoped to the authenticated
caller; a user can only see/edit their own rows.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.shipping_address import ShippingAddress
from apps.api.schemas.shipping_address import (
    ShippingAddressCreate,
    ShippingAddressResponse,
    ShippingAddressUpdate,
)
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/me/shipping-addresses", tags=["shipping-addresses"])


def _to_response(addr: ShippingAddress) -> ShippingAddressResponse:
    return ShippingAddressResponse(
        id=str(addr.id),
        label=addr.label,
        recipient_name=addr.recipient_name,
        line1=addr.line1,
        line2=addr.line2,
        city=addr.city,
        region=addr.region,
        postal_code=addr.postal_code,
        country=addr.country,
        phone=addr.phone,
        notes=addr.notes,
        is_default=addr.is_default,
        created_at=addr.created_at,
        updated_at=addr.updated_at,
    )


async def _clear_other_defaults(
    db: AsyncSession, user_id: UUID, except_id: UUID | None = None
) -> None:
    """Set is_default=False on every other address for this user. Used when
    a new row is marked default, or an existing one is promoted."""
    stmt = (
        update(ShippingAddress)
        .where(ShippingAddress.user_id == user_id, ShippingAddress.is_default.is_(True))
        .values(is_default=False)
    )
    if except_id is not None:
        stmt = stmt.where(ShippingAddress.id != except_id)
    await db.execute(stmt)


@router.get("", response_model=list[ShippingAddressResponse])
async def list_addresses(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ShippingAddressResponse]:
    result = await db.execute(
        select(ShippingAddress)
        .where(ShippingAddress.user_id == user_id)
        .order_by(
            ShippingAddress.is_default.desc(),
            ShippingAddress.created_at.desc(),
        )
    )
    return [_to_response(a) for a in result.scalars().all()]


@router.post("", response_model=ShippingAddressResponse, status_code=201)
async def create_address(
    body: ShippingAddressCreate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShippingAddressResponse:
    # First address for a user is always the default, regardless of body.
    existing_count = await db.scalar(
        select(ShippingAddress.id)
        .where(ShippingAddress.user_id == user_id)
        .limit(1)
    )
    is_default = body.is_default or existing_count is None

    if is_default:
        await _clear_other_defaults(db, user_id)

    addr = ShippingAddress(
        user_id=user_id,
        label=body.label,
        recipient_name=body.recipient_name,
        line1=body.line1,
        line2=body.line2,
        city=body.city,
        region=body.region,
        postal_code=body.postal_code,
        country=body.country,
        phone=body.phone,
        notes=body.notes,
        is_default=is_default,
    )
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return _to_response(addr)


@router.patch("/{address_id}", response_model=ShippingAddressResponse)
async def update_address(
    address_id: UUID,
    body: ShippingAddressUpdate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShippingAddressResponse:
    result = await db.execute(
        select(ShippingAddress).where(
            ShippingAddress.id == address_id,
            ShippingAddress.user_id == user_id,
        )
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(
            status_code=404,
            detail={"code": "ADDRESS_NOT_FOUND", "message": "Shipping address not found"},
        )

    updates = body.model_dump(exclude_unset=True)
    if updates.get("is_default") is True:
        await _clear_other_defaults(db, user_id, except_id=address_id)

    for field, value in updates.items():
        setattr(addr, field, value)

    await db.commit()
    await db.refresh(addr)
    return _to_response(addr)


@router.delete("/{address_id}", status_code=204, response_class=Response)
async def delete_address(
    address_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    result = await db.execute(
        select(ShippingAddress).where(
            ShippingAddress.id == address_id,
            ShippingAddress.user_id == user_id,
        )
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(
            status_code=404,
            detail={"code": "ADDRESS_NOT_FOUND", "message": "Shipping address not found"},
        )

    # Reject if the address is still referenced by an in-flight redemption
    # (anything not in terminal status fulfilled/cancelled).
    in_use = await db.scalar(
        select(RedemptionRequest.id)
        .where(
            RedemptionRequest.shipping_address_id == address_id,
            RedemptionRequest.status.notin_(("fulfilled", "cancelled")),
        )
        .limit(1)
    )
    if in_use is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "IN_USE",
                "message": (
                    "This address is attached to an in-flight redemption "
                    "request and can't be deleted until that request is "
                    "fulfilled or cancelled."
                ),
            },
        )

    was_default = addr.is_default
    await db.delete(addr)
    await db.commit()

    # Promote the next-most-recent address to default if we just deleted
    # the default. Avoids the "no default exists" state.
    if was_default:
        next_addr = await db.scalar(
            select(ShippingAddress)
            .where(ShippingAddress.user_id == user_id)
            .order_by(ShippingAddress.created_at.desc())
            .limit(1)
        )
        if next_addr is not None:
            next_addr.is_default = True
            await db.commit()

    return Response(status_code=204)
