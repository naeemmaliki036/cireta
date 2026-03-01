"""Token sale endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import SaleStatus
from apps.api.models.sale_phase import SalePhase
from apps.api.schemas.sale import (
    ContributeRequest,
    ContributionResponse,
    OTCAllocateRequest,
    SaleCreateRequest,
    SaleListResponse,
    SalePhaseResponse,
    SaleResponse,
)
from apps.api.services.sale_service import SaleService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/sales", tags=["sales"])


async def get_sale_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SaleService:
    """Get sale service instance."""
    return SaleService(db)


def _phase_to_response(phase) -> SalePhaseResponse:
    """Convert phase model to response."""
    return SalePhaseResponse(
        id=str(phase.id),
        phase_number=phase.phase_number,
        name=phase.name,
        price_per_token=str(phase.price_per_token),
        allocation=str(phase.allocation),
        min_contribution=str(phase.min_contribution),
        max_contribution=str(phase.max_contribution),
        start_time=phase.start_time,
        end_time=phase.end_time,
        whitelist_only=phase.whitelist_only,
        is_active=phase.is_active,
    )


def _sale_to_response(sale) -> SaleResponse:
    """Convert sale model to response."""
    return SaleResponse(
        id=str(sale.id),
        token_id=str(sale.token_id),
        issuer_id=str(sale.issuer_id),
        payment_token=sale.payment_token,
        soft_cap=str(sale.soft_cap),
        hard_cap=str(sale.hard_cap),
        status=(sale.status.value if hasattr(sale.status, "value") else sale.status),
        total_raised=str(sale.total_raised),
        is_active=sale.is_active,
        soft_cap_reached=sale.soft_cap_reached,
        hard_cap_reached=sale.hard_cap_reached,
        remaining_capacity=str(sale.remaining_capacity),
        phases=[_phase_to_response(p) for p in sale.phases],
        token_name=sale.token.name if sale.token else None,
        token_symbol=sale.token.symbol if sale.token else None,
        token_slug=sale.token.slug if sale.token else None,
        token_asset_type=(sale.token.asset_type.value if hasattr(sale.token.asset_type, "value") else sale.token.asset_type) if sale.token else None,
        token_description=sale.token.description if sale.token else None,
        token_image_url=sale.token.image_url if sale.token else None,
        issuer_name=sale.issuer.name if sale.issuer else None,
        issuer_slug=sale.issuer.slug if sale.issuer else None,
    )


def _contribution_to_response(contrib) -> ContributionResponse:
    """Convert contribution model to response."""
    return ContributionResponse(
        id=str(contrib.id),
        sale_id=str(contrib.sale_id),
        phase_id=str(contrib.phase_id),
        amount=str(contrib.amount),
        tokens_allocated=str(contrib.tokens_allocated),
        tx_hash=contrib.tx_hash,
        status=(contrib.status.value if hasattr(contrib.status, "value") else contrib.status),
        claimed_at=contrib.claimed_at,
    )



@router.get("/by-slug/{slug}", response_model=SaleResponse)
async def get_sale_by_slug(
    slug: str,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleResponse:
    """Get a sale by its token slug.

    Public endpoint.
    """
    sale = await sale_service.get_sale_by_token_slug(slug)
    if not sale:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    return _sale_to_response(sale)


@router.get("/", response_model=SaleListResponse)
async def list_sales(
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    status_filter: SaleStatus | None = None,
) -> SaleListResponse:
    """List all token sales with pagination.

    Public endpoint.
    """
    sales, total = await sale_service.list_sales(page, size, status_filter)

    return SaleListResponse(
        items=[_sale_to_response(s) for s in sales],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: UUID,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleResponse:
    """Get sale details.

    Public endpoint.
    """
    sale = await sale_service.get_sale(sale_id)
    return _sale_to_response(sale)


@router.post("/", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    request: SaleCreateRequest,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleResponse:
    """Create a new token sale.

    Requires: issuer role.
    """
    sale = await sale_service.create_sale(
        user_id=user_id,
        token_id=UUID(request.token_id),
        payment_token=request.payment_token,
        soft_cap=request.soft_cap,
        hard_cap=request.hard_cap,
        phases=[p.model_dump() for p in request.phases],
    )
    return _sale_to_response(sale)


@router.post("/{sale_id}/contribute", response_model=ContributionResponse)
async def contribute(
    sale_id: UUID,
    request: ContributeRequest,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> ContributionResponse:
    """Contribute to a token sale.

    Requires: bearer token, kyc_level >= 2.
    Rate limit: 20/min.
    """
    contribution = await sale_service.contribute(
        user_id=user_id,
        sale_id=sale_id,
        amount=request.amount,
        tx_hash=request.tx_hash,
    )
    return _contribution_to_response(contribution)


@router.post("/{sale_id}/finalize", response_model=SaleResponse)
async def finalize_sale(
    sale_id: UUID,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleResponse:
    """Finalize a token sale.

    Requires: issuer role (must be sale owner).
    """
    sale = await sale_service.finalize_sale(user_id, sale_id)
    return _sale_to_response(sale)


@router.post("/{sale_id}/claim", response_model=list[ContributionResponse])
async def claim_tokens(
    sale_id: UUID,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> list[ContributionResponse]:
    """Claim tokens from a finalized sale.

    Requires: bearer token.
    """
    contributions = await sale_service.claim_tokens(user_id, sale_id)
    return [_contribution_to_response(c) for c in contributions]


@router.post("/{sale_id}/refund", response_model=list[ContributionResponse])
async def claim_refund(
    sale_id: UUID,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> list[ContributionResponse]:
    """Claim refund from a failed sale.

    Requires: bearer token.
    """
    contributions = await sale_service.claim_refund(user_id, sale_id)
    return [_contribution_to_response(c) for c in contributions]


@router.post("/{sale_id}/otc")
async def otc_allocate(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: "OTCAllocateRequest",
) -> dict:
    """OTC allocation — issuer manually allocates tokens to a verified investor."""
    from decimal import Decimal

    from sqlalchemy import select

    from apps.api.models.contribution import Contribution
    from apps.api.models.issuer import Issuer
    from apps.api.models.token_sale import TokenSale

    # Verify caller is an issuer
    issuer_result = await db.execute(select(Issuer).where(Issuer.user_id == user_id))
    issuer = issuer_result.scalar_one_or_none()
    if not issuer:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Issuer access required")

    sale_result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id, TokenSale.issuer_id == issuer.id))
    sale = sale_result.scalar_one_or_none()
    if not sale:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Sale not found")

    # Create OTC contribution (is_otc=True, excluded from fee base)
    contrib = Contribution()
    contrib.user_id = user_id  # issuer's user_id as placeholder — in prod link to investor user
    contrib.sale_id = sale_id
    contrib.phase_id = (await db.execute(
        select(SalePhase).where(SalePhase.sale_id == sale_id).order_by(SalePhase.phase_number).limit(1)
    )).scalar_one().id
    contrib.amount = Decimal("0")  # OTC — no on-platform USDC
    contrib.tokens_allocated = Decimal(str(request.token_amount))
    contrib.tx_hash = f"otc-{sale_id}-{request.investor_wallet[:8]}-{int(__import__('time').time())}"
    contrib.is_otc = True
    contrib.otc_reference = request.payment_reference
    contrib.wallet_address = request.investor_wallet
    contrib.status = "confirmed"

    # Update sale total (OTC counts toward hard cap but NOT toward on-platform total)
    sale.total_raised += Decimal("0")  # OTC doesn't change USDC raised

    db.add(contrib)
    await db.commit()
    return {"message": "OTC allocation recorded", "tokens_allocated": str(request.token_amount)}
