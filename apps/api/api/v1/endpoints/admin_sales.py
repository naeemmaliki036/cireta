"""Admin sale management endpoints — approval, rejection, finalization."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import SaleStatus
from apps.api.models.token_sale import TokenSale
from apps.api.services.sale_service import SaleService
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(prefix="/admin/sales", tags=["admin-sales"])


async def get_sale_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SaleService:
    return SaleService(db)


class SaleActionRequest(BaseModel):
    reason: str | None = None


class SaleActionResponse(BaseModel):
    sale_id: str
    status: str
    message: str


@router.post("/{sale_id}/approve", response_model=SaleActionResponse)
async def approve_sale(
    sale_id: UUID,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleActionResponse:
    """Approve a pending sale.

    If is_coming_soon → APPROVED_COMING_SOON (visible on launchpad, no buy).
    If not coming_soon → APPROVED (issuer can deploy on-chain).
    """
    result = await sale_service.db.execute(
        select(TokenSale).where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.status != SaleStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": f"Sale must be PENDING_APPROVAL, currently: {sale.status}"})

    if sale.is_coming_soon:
        sale.status = SaleStatus.APPROVED_COMING_SOON
        sale.is_visible = True  # Auto-visible on launchpad
        msg = "Sale approved as Coming Soon — now visible on launchpad"
    else:
        sale.status = SaleStatus.APPROVED
        msg = "Sale approved — issuer can now deploy on-chain"

    await sale_service.db.commit()
    return SaleActionResponse(sale_id=str(sale_id), status=sale.status.value, message=msg)


@router.post("/{sale_id}/reject", response_model=SaleActionResponse)
async def reject_sale(
    sale_id: UUID,
    request: SaleActionRequest,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleActionResponse:
    """Reject a pending sale — returns to rejected status."""
    result = await sale_service.db.execute(
        select(TokenSale).where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.status != SaleStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": f"Sale must be PENDING_APPROVAL, currently: {sale.status}"})

    sale.status = SaleStatus.REJECTED
    await sale_service.db.commit()
    return SaleActionResponse(sale_id=str(sale_id), status=sale.status.value, message=f"Sale rejected: {request.reason or 'No reason provided'}")


@router.post("/{sale_id}/toggle-visibility", response_model=SaleActionResponse)
async def toggle_visibility(
    sale_id: UUID,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleActionResponse:
    """Toggle sale visibility on the launchpad. Sale must be approved first."""
    result = await sale_service.db.execute(
        select(TokenSale).where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    allowed = [SaleStatus.APPROVED, SaleStatus.APPROVED_COMING_SOON, SaleStatus.ACTIVE,
               SaleStatus.PAUSED, SaleStatus.FINALIZED_SUCCESS, SaleStatus.FINALIZED_FAILED]
    if sale.status not in allowed:
        raise HTTPException(status_code=400, detail={
            "code": "INVALID_STATUS",
            "message": f"Sale must be approved before changing visibility. Current status: {sale.status}",
        })

    sale.is_visible = not sale.is_visible
    await sale_service.db.commit()
    action = "visible" if sale.is_visible else "hidden"
    status_val = sale.status.value if hasattr(sale.status, "value") else sale.status
    return SaleActionResponse(sale_id=str(sale_id), status=status_val, message=f"Sale is now {action} on the launchpad")


@router.post("/{sale_id}/activate", response_model=SaleActionResponse)
async def activate_sale(
    sale_id: UUID,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleActionResponse:
    """Record on-chain activation — update DB status to active.

    Called after admin successfully calls Sale.activate() on-chain.
    """
    result = await sale_service.db.execute(
        select(TokenSale).where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.status not in (SaleStatus.APPROVED, SaleStatus.APPROVED_COMING_SOON):
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": f"Sale must be APPROVED to activate, currently: {sale.status}"})

    sale.status = SaleStatus.ACTIVE
    sale.is_visible = True  # Auto-visible on activation
    await sale_service.db.commit()
    return SaleActionResponse(sale_id=str(sale_id), status="active", message="Sale activated — now live for investors")


@router.post("/{sale_id}/finalize", response_model=SaleActionResponse)
async def admin_finalize_sale(
    sale_id: UUID,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleActionResponse:
    """Finalize a sale — admin only."""
    sale = await sale_service.finalize_sale(user_id, sale_id, admin_override=True)
    return SaleActionResponse(
        sale_id=str(sale_id),
        status=sale.status.value if hasattr(sale.status, "value") else sale.status,
        message="Sale finalized",
    )


@router.post("/{sale_id}/display-order", response_model=SaleActionResponse)
async def set_display_order(
    sale_id: UUID,
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
    body: dict = Body(...),
) -> SaleActionResponse:
    """Set the display order for a sale. Lower numbers appear first.
    Set to null to use default ordering (ongoing → upcoming → coming soon)."""
    display_order = body.get("display_order")  # int or None
    sale = await sale_service.get_sale(sale_id)
    sale.display_order = display_order
    await sale_service.db.commit()
    return SaleActionResponse(
        status=sale.status.value if hasattr(sale.status, "value") else sale.status,
        message=f"Display order set to {display_order}" if display_order is not None else "Display order cleared (using default)",
    )


@router.post("/reorder", response_model=dict)
async def reorder_sales(
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
    body: dict = Body(...),
) -> dict:
    """Bulk-set display order for multiple sales.
    Body: { "order": [{"sale_id": "uuid", "display_order": 1}, ...] }"""
    order_list = body.get("order", [])
    for item in order_list:
        sale = await sale_service.get_sale(item["sale_id"])
        sale.display_order = item.get("display_order")
    await sale_service.db.commit()
    return {"message": f"Updated display order for {len(order_list)} sales"}


@router.get("", response_model=dict)
async def list_all_sales(
    user_id: RequireAdmin,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    status_filter: SaleStatus | None = None,
) -> dict:
    """List all sales for admin — includes all statuses."""
    sales, total = await sale_service.list_sales(page, size, status_filter)
    from apps.api.api.v1.endpoints.sales import _sale_to_response

    return {
        "items": [_sale_to_response(s) for s in sales],
        "total": total,
        "page": page,
        "size": size,
    }


# ── OTC Operator management ───────────────────────────────────────────


class OtcOperatorBody(BaseModel):
    """Add or remove an OTC operator wallet."""

    address: str


@router.post("/{sale_id}/otc-operators")
async def add_otc_operator(
    sale_id: UUID,
    body: OtcOperatorBody,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Designate a wallet as OTC operator for a sale."""
    from web3 import Web3

    sale = (await db.execute(select(TokenSale).where(TokenSale.id == sale_id))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    addr = Web3.to_checksum_address(body.address)
    operators: list = sale.otc_operator_addresses or []
    if addr not in operators:
        operators.append(addr)
        sale.otc_operator_addresses = operators
        await db.commit()

    return {"operators": sale.otc_operator_addresses}


@router.delete("/{sale_id}/otc-operators")
async def remove_otc_operator(
    sale_id: UUID,
    body: OtcOperatorBody,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Remove a wallet from OTC operators for a sale."""
    from web3 import Web3

    sale = (await db.execute(select(TokenSale).where(TokenSale.id == sale_id))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    addr = Web3.to_checksum_address(body.address)
    operators: list = sale.otc_operator_addresses or []
    if addr in operators:
        operators.remove(addr)
        sale.otc_operator_addresses = operators if operators else None
        await db.commit()

    return {"operators": sale.otc_operator_addresses or []}


@router.get("/{sale_id}/otc-operators")
async def list_otc_operators(
    sale_id: UUID,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """List OTC operator wallets for a sale."""
    sale = (await db.execute(select(TokenSale).where(TokenSale.id == sale_id))).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return {"operators": sale.otc_operator_addresses or []}
