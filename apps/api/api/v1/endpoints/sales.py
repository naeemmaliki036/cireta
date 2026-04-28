"""Token sale endpoints."""

from datetime import UTC
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import SaleStatus
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token_sale import TokenSale
from apps.api.schemas.sale import (
    ContributeRequest,
    ContributionResponse,
    OTCAllocateRequest,
    SaleCreateRequest,
    SaleDeployRequest,
    SaleDeployResponse,
    SaleListResponse,
    SaleOnChainStatusResponse,
    SalePhaseResponse,
    SaleResponse,
    SaleUpdateRequest,
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


def _phase_to_response(
    phase,
    sold_map: dict[str, tuple[str, str]] | None = None,
) -> SalePhaseResponse:
    """Convert phase model to response.

    `sold_map` maps phase_id (str) → (tokens_sold, usdc_raised). When omitted,
    the response shows zeros.
    """
    sold = ("0", "0")
    if sold_map is not None:
        sold = sold_map.get(str(phase.id), ("0", "0"))
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
        min_tokens=str(getattr(phase, "min_tokens", 0) or getattr(phase, "min_contribution", 0) or 0),
        max_tokens=str(getattr(phase, "max_tokens", 0) or getattr(phase, "max_contribution", 0) or 0),
        top_up_min_tokens=str(getattr(phase, "top_up_min_tokens", 0) or getattr(phase, "top_up_min", 0) or 0),
        allocation_mode=getattr(phase, "allocation_mode", "fixed") or "fixed",
        deployed_on_chain=getattr(phase, "deployed_on_chain", True),
        on_chain_phase_id=getattr(phase, "on_chain_phase_id", None),
        tokens_sold=sold[0],
        usdc_raised=sold[1],
    )


async def _phase_sold_map(
    db: AsyncSession,
    sale_id: UUID,
) -> dict[str, tuple[str, str]]:
    """Aggregate confirmed contribution totals per phase for a sale.

    Returns a map of phase_id (str) → (tokens_sold, usdc_raised).
    """
    from sqlalchemy import func
    from sqlalchemy import select as _select

    from apps.api.models.contribution import Contribution

    rows = await db.execute(
        _select(
            Contribution.phase_id,
            func.coalesce(func.sum(Contribution.tokens_allocated), 0),
            func.coalesce(func.sum(Contribution.amount), 0),
        )
        .where(
            Contribution.sale_id == sale_id,
            Contribution.status == "confirmed",
        )
        .group_by(Contribution.phase_id)
    )
    return {str(pid): (str(tokens), str(amount)) for pid, tokens, amount in rows.all()}


def _sale_to_response(
    sale,
    sold_map: dict[str, tuple[str, str]] | None = None,
) -> SaleResponse:
    """Convert sale model to response. Optional `sold_map` populates per-phase aggregates."""
    return SaleResponse(
        id=str(sale.id),
        token_id=str(sale.token_id) if sale.token_id else None,
        issuer_id=str(sale.issuer_id),
        title=sale.title,
        description_text=sale.description,
        full_description=sale.full_description,
        banner_image_url=sale.banner_image_url or next((img.url for img in getattr(sale, "images", []) if img.is_banner), next((img.url for img in sorted(getattr(sale, "images", []), key=lambda i: i.sort_order or 0)), None)),
        is_coming_soon=sale.is_coming_soon,
        is_visible=getattr(sale, "is_visible", False),
        otc_enabled=sale.otc_enabled,
        otc_content=sale.otc_content,
        otc_token_address=getattr(sale, "otc_token_address", None),
        website_url=sale.website_url,
        twitter_url=sale.twitter_url,
        linkedin_url=sale.linkedin_url,
        instagram_url=sale.instagram_url,
        facebook_url=sale.facebook_url,
        telegram_url=sale.telegram_url,
        discord_url=sale.discord_url,
        sale_structure=sale.sale_structure.value if hasattr(sale.sale_structure, "value") else sale.sale_structure,
        cliff_duration_days=sale.cliff_duration_days,
        vesting_duration_days=sale.vesting_duration_days,
        payment_token=sale.payment_token,
        soft_cap=str(sale.soft_cap),
        hard_cap=str(sale.hard_cap),
        status=(sale.status.value if hasattr(sale.status, "value") else sale.status),
        total_raised=str(sale.total_raised),
        is_active=sale.is_active,
        soft_cap_reached=sale.soft_cap_reached,
        hard_cap_reached=sale.hard_cap_reached,
        remaining_capacity=str(sale.remaining_capacity),
        contract_address=getattr(sale, "contract_address", None),
        phases=[_phase_to_response(p, sold_map) for p in sorted(sale.phases, key=lambda ph: ph.start_time)],
        token_name=sale.token.name if sale.token else None,
        token_symbol=sale.token.symbol if sale.token else None,
        token_slug=sale.token.slug if sale.token else None,
        token_asset_type=(
            sale.token.asset_type.value
            if hasattr(sale.token.asset_type, "value")
            else sale.token.asset_type
        )
        if sale.token
        else None,
        token_description=sale.token.description if sale.token else None,
        token_image_url=sale.token.image_url if sale.token else None,
        token_contract_address=sale.token.contract_address if sale.token else None,
        identity_registry_address=sale.token.identity_registry_address if sale.token else None,
        issuer_name=sale.issuer.name if sale.issuer else None,
        issuer_slug=sale.issuer.slug if sale.issuer else None,
        # Round-5 fields
        is_open_ended=getattr(sale, "is_open_ended", False) or False,
        total_token_supply=str(sale.total_token_supply) if getattr(sale, "total_token_supply", None) else None,
        sale_start_time=getattr(sale, "sale_start_time", None),
        sale_end_time=getattr(sale, "sale_end_time", None),
        approved_at=getattr(sale, "approved_at", None),
        activated_at=getattr(sale, "activated_at", None),
        refunds_activated_at=getattr(sale, "refunds_activated_at", None),
        finalization_pending=getattr(sale, "finalization_pending", False) or False,
        display_order=getattr(sale, "display_order", None),
        is_redeemable=getattr(sale, "is_redeemable", False) or False,
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
        claim_tx_hash=getattr(contrib, "claim_tx_hash", None),
        is_otc=getattr(contrib, "is_otc", False),
        otc_reference=getattr(contrib, "otc_reference", None),
        wallet_address=getattr(contrib, "wallet_address", None),
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
    sold_map = await _phase_sold_map(sale_service.db, sale.id)
    return _sale_to_response(sale, sold_map)


@router.get("", response_model=SaleListResponse)
async def list_sales(
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    status_filter: SaleStatus | None = None,
) -> SaleListResponse:
    """List public token sales (ACTIVE + APPROVED_COMING_SOON).

    Public endpoint.
    """
    sales, total = await sale_service.list_sales(page, size, status_filter, public_only=True)

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
    sold_map = await _phase_sold_map(sale_service.db, sale.id)
    return _sale_to_response(sale, sold_map)


@router.patch("/{sale_id}", response_model=SaleResponse)
async def update_sale(
    sale_id: UUID,
    request: SaleUpdateRequest,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SaleResponse:
    """Update sale details.

    Content/marketing fields (title, description, social URLs, OTC config) are
    editable in any status. Financial/structural fields (caps, payment token,
    vesting, sale window, token, sale_mode/structure) are only writable while
    the sale is in `draft` status — once submitted/approved/active they are
    locked because they affect the on-chain contract or pending review.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(TokenSale)
        .options(
            selectinload(TokenSale.issuer),
            selectinload(TokenSale.token),
            selectinload(TokenSale.phases),
            selectinload(TokenSale.images),
        )
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})

    DRAFT_ONLY_FIELDS = {
        "is_coming_soon", "sale_mode", "sale_structure",
        "cliff_duration_days", "vesting_duration_days",
        "token_id", "payment_token", "soft_cap", "hard_cap",
        "total_token_supply", "sale_start_time", "sale_end_time",
    }
    update_data = request.model_dump(exclude_unset=True)
    is_draft = sale.status == "draft"
    blocked = [k for k in update_data if k in DRAFT_ONLY_FIELDS and not is_draft]
    if blocked:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "FIELDS_LOCKED_AFTER_DRAFT",
                "message": f"Cannot edit {', '.join(blocked)} after sale leaves draft status",
            },
        )

    for field, value in update_data.items():
        setattr(sale, field, value)

    await db.commit()
    await db.refresh(sale)
    return _sale_to_response(sale)


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
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
        token_id=UUID(request.token_id) if request.token_id else None,
        payment_token=request.payment_token,
        soft_cap=request.soft_cap,
        hard_cap=request.hard_cap,
        phases=[p.model_dump() for p in request.phases],
        title=request.title,
        description=request.description,
        full_description=request.full_description,
        banner_image_url=request.banner_image_url,
        is_coming_soon=request.is_coming_soon,
        otc_enabled=request.otc_enabled,
        otc_content=request.otc_content,
        website_url=request.website_url,
        twitter_url=request.twitter_url,
        linkedin_url=request.linkedin_url,
        instagram_url=request.instagram_url,
        facebook_url=request.facebook_url,
        telegram_url=request.telegram_url,
        discord_url=request.discord_url,
        sale_mode=request.sale_mode,
        sale_structure=request.sale_structure,
        cliff_duration_days=request.cliff_duration_days,
        vesting_duration_days=request.vesting_duration_days,
        is_redeemable=request.is_redeemable,
    )
    return _sale_to_response(sale)


class OtcContentUpdate(BaseModel):
    """Update OTC content for a sale."""

    otc_enabled: bool
    otc_content: str | None = None


@router.put("/{sale_id}/otc-content", response_model=SaleResponse)
async def update_otc_content(
    sale_id: UUID,
    request: OtcContentUpdate,
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> SaleResponse:
    """Update OTC toggle and content for a sale. Issuer only."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.phases), selectinload(TokenSale.token), selectinload(TokenSale.issuer), selectinload(TokenSale.images))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not your sale"})

    sale.otc_enabled = request.otc_enabled
    sale.otc_content = request.otc_content
    await db.commit()
    await db.refresh(sale)
    return _sale_to_response(sale)


@router.post("/{sale_id}/deploy", response_model=SaleDeployResponse)
async def deploy_sale(
    sale_id: UUID,
    request: SaleDeployRequest,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleDeployResponse:
    """Deploy a sale contract on-chain.

    Requires: issuer role (must be sale owner).
    """
    from fastapi import HTTPException
    from sqlalchemy.orm import selectinload

    from apps.api.models.token_sale import TokenSale

    # Verify caller is the issuer who owns this sale
    sale_result = await sale_service.db.execute(
        select(TokenSale)
        .options(
            selectinload(TokenSale.issuer),
            selectinload(TokenSale.token),
            selectinload(TokenSale.phases),
        )
        .where(TokenSale.id == sale_id)
    )
    sale = sale_result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})
    if not sale.issuer.is_active:
        raise HTTPException(
            status_code=403,
            detail={"code": "ISSUER_NOT_ACTIVE", "message": "Issuer must be fully activated before deploying. Complete onboarding first."},
        )
    if sale.status not in (SaleStatus.APPROVED, SaleStatus.DRAFT):
        raise HTTPException(
            status_code=400,
            detail={"code": "SALE_NOT_APPROVED", "message": f"Sale must be approved before deployment, currently: {sale.status}"},
        )
    if not sale.token or not sale.token.contract_address:
        raise HTTPException(
            status_code=400,
            detail={"code": "TOKEN_NOT_DEPLOYED", "message": "Token must be deployed first"},
        )

    from apps.api.services.web3_sale_service import Web3SaleService
    from packages.common.core.config import settings as _settings

    web3_sale = Web3SaleService()
    identity_reg = request.identity_registry or sale.token.identity_registry_address
    if not identity_reg:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_IDENTITY_REGISTRY", "message": "Identity registry address is required — set it on the token or provide it in the request"},
        )
    issuer_addr = sale.issuer.wallet_address or web3_sale.tx_svc._account.address
    fee_mgr = _settings.platform_fee_receiver or web3_sale.tx_svc._account.address
    soft = int(sale.soft_cap * 10**6)
    hard = int(sale.hard_cap * 10**6)

    # Round-5: total token supply is now an explicit field on the sale.
    if sale.total_token_supply <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ZERO_TOKEN_SUPPLY",
                "message": "Sale total_token_supply must be greater than zero.",
            },
        )
    # Project token decimals — assume 6 if not on the token row, otherwise use it
    project_decimals = getattr(sale.token, "decimals", 18) or 18
    total_supply_raw = int(sale.total_token_supply * (10 ** project_decimals))

    # Round-5: sale_end_time = NULL → open-ended (encoded as 0 on-chain).
    # sale_start_time defaults to "now + 60s" if not set.
    from datetime import datetime, timedelta
    if sale.sale_start_time:
        sale_start_ts = int(sale.sale_start_time.timestamp())
    else:
        sale_start_ts = int((datetime.now(UTC) + timedelta(seconds=60)).timestamp())
    sale_end_ts = int(sale.sale_end_time.timestamp()) if sale.sale_end_time else 0

    # If phases exist, derive a sane window from them when not explicitly set.
    if sale.phases:
        sorted_phases = sorted(sale.phases, key=lambda p: p.start_time)
        if not sale.sale_start_time:
            sale_start_ts = int(sorted_phases[0].start_time.timestamp())
        if not sale.sale_end_time and not sale.is_open_ended:
            sale_end_ts = int(max(p.end_time for p in sale.phases).timestamp())

    mode = sale.sale_mode.value if hasattr(sale.sale_mode, 'value') else str(sale.sale_mode)
    if mode == "vested":
        # Vested mode: deploy sale + vault + fraction token
        sale_address, vault_address, fraction_address, tx_hash = await web3_sale.deploy_sale_vested(
            token_address=sale.token.contract_address,
            payment_token=sale.payment_token,
            identity_registry=identity_reg,
            issuer_wallet=issuer_addr,
            fee_manager=fee_mgr,
            soft_cap=soft,
            hard_cap=hard,
            fee_basis_points=request.fee_basis_points,
            fee_cap_usdc=int(request.fee_cap_usdc * 10**6),
            sale_start_time=sale_start_ts,
            sale_end_time=sale_end_ts,
            total_token_supply=total_supply_raw,
            fraction_name=f"c{sale.token.symbol}",
            fraction_symbol=f"c{sale.token.symbol}",
            cliff_duration=request.cliff_duration if hasattr(request, 'cliff_duration') else 0,
            vesting_duration=request.vesting_duration if hasattr(request, 'vesting_duration') else 365 * 86400,
        )
        sale.vault_address = vault_address
        sale.fraction_token_address = fraction_address
    else:
        # Direct mode
        sale_address, tx_hash = await web3_sale.deploy_sale(
            token_address=sale.token.contract_address,
            payment_token=sale.payment_token,
            identity_registry=identity_reg,
            issuer_wallet=issuer_addr,
            fee_manager=fee_mgr,
            sale_factory_address=_settings.sale_factory_address or web3_sale.tx_svc._account.address,
            soft_cap=soft,
            hard_cap=hard,
            fee_basis_points=request.fee_basis_points,
            fee_cap_usdc=int(request.fee_cap_usdc * 10**6),
            sale_start_time=sale_start_ts,
            sale_end_time=sale_end_ts,
            total_token_supply=total_supply_raw,
        )

    # Persist sale address to DB
    sale.contract_address = sale_address
    await sale_service.db.commit()

    # Audit log
    from apps.api.services.web3_tx_service import Web3TxService

    tx_svc = Web3TxService()
    await tx_svc.write_tx_audit(
        db=sale_service.db,
        tx_hash=tx_hash,
        action="deploy_sale",
        target_type="sale",
        target_id=str(sale_id),
        actor_id=user_id,
        payload={"sale_address": sale_address},
    )
    await sale_service.db.commit()

    return SaleDeployResponse(
        sale_id=str(sale_id),
        sale_address=sale_address,
        tx_hash=tx_hash,
    )


@router.get("/{sale_id}/on-chain", response_model=SaleOnChainStatusResponse)
async def get_sale_on_chain_status(
    sale_id: UUID,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> SaleOnChainStatusResponse:
    """Get on-chain sale status.

    Public endpoint.
    """
    from fastapi import HTTPException

    from apps.api.models.token_sale import TokenSale

    sale_result = await sale_service.db.execute(
        select(TokenSale).where(TokenSale.id == sale_id)
    )
    sale = sale_result.scalar_one_or_none()
    if not sale or not getattr(sale, "contract_address", None):
        raise HTTPException(
            status_code=404,
            detail={"code": "SALE_NOT_DEPLOYED", "message": "Sale not deployed on-chain"},
        )

    from apps.api.services.web3_sale_service import Web3SaleService

    web3_sale = Web3SaleService()
    data = await web3_sale.get_sale_status(sale.contract_address)

    return SaleOnChainStatusResponse(
        status=data["status"],
        total_raised=str(data["total_raised"]),
        soft_cap=str(data["soft_cap"]),
        hard_cap=str(data["hard_cap"]),
        phases=data["phases"],
    )


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
    import logging as _log
    _log.getLogger("sales.contribute").info(
        "Contribute request: sale=%s user=%s amount=%s tx=%s phase=%s",
        sale_id, user_id, request.amount, request.tx_hash, getattr(request, "phase_id", "?"),
    )
    contribution = await sale_service.contribute(
        user_id=user_id,
        sale_id=sale_id,
        amount=request.amount,
        tx_hash=request.tx_hash,
    )
    # Fire investment confirmed notification (non-blocking)
    try:
        from sqlalchemy import select as _select

        from apps.api.models.user import User as _User
        from apps.api.services.notification_service import NotificationService as _NS

        _res = await sale_service.db.execute(_select(_User).where(_User.id == user_id))
        _user = _res.scalar_one_or_none()
        if _user:
            _token_symbol = (
                contribution.phase.sale.token.symbol if hasattr(contribution, "phase") else "TOKEN"
            )
            await _NS(sale_service.db).notify_investment_confirmed(
                user_id, _user.email, str(request.amount), _token_symbol,
            )
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            "Failed to send investment notification for user=%s sale=%s",
            user_id,
            sale_id,
            exc_info=True,
        )
    return _contribution_to_response(contribution)


@router.get("/{sale_id}/transactions")
async def list_sale_transactions(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict]:
    """Public endpoint: list all contributions for a sale (no auth required).

    Shows sale-level transaction history visible to everyone — amounts,
    types, and tx hashes. Wallet addresses are truncated for privacy.
    """
    from sqlalchemy.orm import selectinload

    from apps.api.models.contribution import Contribution

    result = await db.execute(
        select(Contribution)
        .options(selectinload(Contribution.phase))
        .where(Contribution.sale_id == sale_id)
        .order_by(Contribution.created_at.desc())
        .limit(limit)
    )
    contributions = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "type": "investment",
            "amount": str(c.amount),
            "tokens_allocated": str(c.tokens_allocated),
            "is_otc": getattr(c, "is_otc", False) or False,
            "status": c.status,
            "tx_hash": c.tx_hash,
            "wallet_address": c.wallet_address[:6] + "..." + c.wallet_address[-4:] if c.wallet_address else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "phase_name": c.phase.name if c.phase else None,
        }
        for c in contributions
    ]


class PhaseCreateRequest(BaseModel):
    """Create a sale phase. Set deployed_on_chain=true when recording an already-deployed
    phase; leave false (default) for tentative/planned phases."""
    name: str
    price_per_token: str
    allocation: str
    min_contribution: str  # required, must parse to Decimal > 0 — see add_phase()
    max_contribution: str = "0"
    # Round-5: per-phase min top-up for repeat buyers — must be ≥ 1000 USDC
    top_up_min: str = "1000"
    start_time: str
    end_time: str
    whitelist_only: bool = False
    # Round-5: per-phase allocation strategy
    allocation_mode: str = "fixed"
    # Off-chain tentative phase support
    deployed_on_chain: bool = False
    on_chain_phase_id: int | None = None


@router.post("/{sale_id}/phases", status_code=201)
async def add_phase(
    sale_id: UUID,
    request: PhaseCreateRequest,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Record a phase in the DB (after it's been added on-chain)."""
    from sqlalchemy.orm import selectinload

    from apps.api.models.sale_phase import SalePhase

    result = await db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.issuer), selectinload(TokenSale.phases))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})

    from datetime import datetime
    from decimal import Decimal
    min_contribution = Decimal(request.min_contribution)
    max_contribution = Decimal(request.max_contribution)
    price_per_token = Decimal(request.price_per_token)
    allocation_dec = Decimal(request.allocation)
    if min_contribution <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ZERO_MIN_CONTRIBUTION",
                "message": "Phase min_contribution must be greater than zero. "
                "If you want a low floor, set $1.",
            },
        )
    if price_per_token <= 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "ZERO_PRICE_PER_TOKEN", "message": "Phase price_per_token must be greater than zero."},
        )
    if max_contribution != 0 and max_contribution < min_contribution:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CONTRIBUTION_RANGE", "message": "Phase max_contribution must be >= min_contribution."},
        )
    # Parse times
    try:
        start_dt = (
            request.start_time
            if isinstance(request.start_time, datetime)
            else datetime.fromisoformat(str(request.start_time).replace("Z", "+00:00"))
        )
        end_dt = (
            request.end_time
            if isinstance(request.end_time, datetime)
            else datetime.fromisoformat(str(request.end_time).replace("Z", "+00:00"))
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_PHASE_TIME_RANGE", "message": "Could not parse phase start/end time."},
        ) from exc
    if start_dt >= end_dt:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_PHASE_TIME_RANGE", "message": "Phase start_time must be before end_time."},
        )
    if end_dt <= datetime.now(UTC):
        raise HTTPException(
            status_code=400,
            detail={"code": "PHASE_IN_PAST", "message": "Phase end_time must be in the future."},
        )
    # If the parent sale is already deployed, validate the new phase falls inside
    # the on-chain sale window. If not yet deployed, the contract will enforce
    # this at addPhase time after deployment.
    if sale.contract_address:
        existing_starts = [p.start_time for p in sale.phases]
        existing_ends = [p.end_time for p in sale.phases]
        if existing_starts and existing_ends:
            sale_window_start = min(existing_starts)
            sale_window_end = max(existing_ends)
            if start_dt < sale_window_start or end_dt > sale_window_end:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "PHASE_OUTSIDE_SALE_WINDOW",
                        "message": "Phase must fall inside the sale window. "
                        f"Sale window: {sale_window_start.isoformat()} to {sale_window_end.isoformat()}.",
                    },
                )
    # Round-5: top_up_min and allocation_mode validation
    top_up_min = Decimal(request.top_up_min)
    if top_up_min < Decimal("1000"):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "TOP_UP_BELOW_FLOOR",
                "message": "Phase top_up_min must be at least 1000 USDC.",
            },
        )
    if request.allocation_mode not in ("fixed", "remaining"):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_ALLOCATION_MODE", "message": "allocation_mode must be 'fixed' or 'remaining'."},
        )
    if request.allocation_mode == "fixed" and allocation_dec <= 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "ZERO_PHASE_ALLOCATION", "message": "Fixed allocation_mode requires allocation > 0."},
        )

    phase = SalePhase()
    phase.sale_id = sale_id
    phase.phase_number = len(sale.phases) + 1
    phase.name = request.name
    phase.price_per_token = price_per_token
    phase.allocation = allocation_dec
    phase.min_contribution = min_contribution
    phase.max_contribution = max_contribution
    phase.top_up_min = top_up_min
    phase.allocation_mode = request.allocation_mode
    phase.start_time = request.start_time
    phase.end_time = request.end_time
    phase.whitelist_only = request.whitelist_only
    phase.deployed_on_chain = request.deployed_on_chain
    phase.on_chain_phase_id = request.on_chain_phase_id

    # Round-5: update parent sale's lastPhaseAddedAt for inactivity tracking
    from datetime import datetime as _dt
    sale.last_phase_added_at = _dt.now(UTC)

    db.add(phase)
    await db.commit()
    return {"phase_id": str(phase.id), "phase_number": phase.phase_number}


class PhaseUpdateRequest(BaseModel):
    """Update a tentative (not-yet-deployed) phase. Deployed phases are immutable."""
    name: str | None = None
    price_per_token: str | None = None
    allocation: str | None = None
    min_contribution: str | None = None
    max_contribution: str | None = None
    top_up_min: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    whitelist_only: bool | None = None
    allocation_mode: str | None = None
    # Set to true + on_chain_phase_id when deploying on-chain
    deployed_on_chain: bool | None = None
    on_chain_phase_id: int | None = None


@router.patch("/{sale_id}/phases/{phase_id}")
async def update_phase(
    sale_id: UUID,
    phase_id: UUID,
    request: PhaseUpdateRequest,
    user_id: CurrentUserId,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Update a tentative phase. Deployed phases can only update deployed_on_chain + on_chain_phase_id."""
    from apps.api.models.sale_phase import SalePhase

    phase = (await db.execute(
        select(SalePhase).where(SalePhase.id == phase_id, SalePhase.sale_id == sale_id)
    )).scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")

    # If already deployed, only allow marking deployed status
    if phase.deployed_on_chain:
        if request.deployed_on_chain is not None:
            phase.deployed_on_chain = request.deployed_on_chain
        if request.on_chain_phase_id is not None:
            phase.on_chain_phase_id = request.on_chain_phase_id
        await db.commit()
        return {"phase_id": str(phase.id), "status": "updated (deployed — limited fields)"}

    # Tentative phase: update all provided fields
    from decimal import Decimal
    if request.name is not None:
        phase.name = request.name
    if request.price_per_token is not None:
        phase.price_per_token = Decimal(request.price_per_token)
    if request.allocation is not None:
        phase.allocation = Decimal(request.allocation)
    if request.min_contribution is not None:
        phase.min_contribution = Decimal(request.min_contribution)
    if request.max_contribution is not None:
        phase.max_contribution = Decimal(request.max_contribution)
    if request.top_up_min is not None:
        phase.top_up_min = Decimal(request.top_up_min)
    if request.start_time is not None:
        from datetime import datetime
        phase.start_time = datetime.fromisoformat(str(request.start_time).replace("Z", "+00:00"))
    if request.end_time is not None:
        from datetime import datetime
        phase.end_time = datetime.fromisoformat(str(request.end_time).replace("Z", "+00:00"))
    if request.whitelist_only is not None:
        phase.whitelist_only = request.whitelist_only
    if request.allocation_mode is not None:
        phase.allocation_mode = request.allocation_mode
    if request.deployed_on_chain is not None:
        phase.deployed_on_chain = request.deployed_on_chain
    if request.on_chain_phase_id is not None:
        phase.on_chain_phase_id = request.on_chain_phase_id

    await db.commit()
    return {"phase_id": str(phase.id), "status": "updated"}


@router.delete("/{sale_id}/phases/{phase_id}")
async def delete_phase(
    sale_id: UUID,
    phase_id: UUID,
    user_id: CurrentUserId,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Delete a tentative phase. Deployed phases cannot be deleted."""
    from apps.api.models.sale_phase import SalePhase

    phase = (await db.execute(
        select(SalePhase).where(SalePhase.id == phase_id, SalePhase.sale_id == sale_id)
    )).scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    if phase.deployed_on_chain:
        raise HTTPException(status_code=409, detail="Cannot delete a deployed phase")

    await db.delete(phase)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{sale_id}/submit-for-approval")
async def submit_for_approval(
    sale_id: UUID,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> dict:
    """Submit a draft sale for admin approval.

    Requires: issuer (must own the sale).
    """
    from fastapi import HTTPException
    from sqlalchemy.orm import selectinload

    result = await sale_service.db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.issuer))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})
    if sale.status != SaleStatus.DRAFT:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": f"Sale must be DRAFT, currently: {sale.status}"})

    # Prerequisites for non-coming-soon sales
    if not sale.is_coming_soon:
        if not sale.contract_address:
            raise HTTPException(status_code=400, detail={
                "code": "NOT_DEPLOYED",
                "message": "Sale contract must be deployed on-chain before submitting for approval.",
            })

        # Verify on-chain: phases configured and tokens deposited
        try:
            from apps.api.services.web3_base_service import Web3BaseService
            w3_svc = Web3BaseService()
            w3 = w3_svc.w3

            sale_abi = [
                {"name": "status", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "uint8"}]},
                {"name": "saleMode", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "uint8"}]},
                {"name": "vault", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "address"}]},
                {"name": "token", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "address"}]},
            ]
            erc20_abi = [{"name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]}]

            sale_contract = w3.eth.contract(address=w3.to_checksum_address(sale.contract_address), abi=sale_abi)
            token_addr = sale_contract.functions.token().call()
            sale_mode = sale_contract.functions.saleMode().call()  # 0=Direct, 1=Vested

            # Check token balance
            token_contract = w3.eth.contract(address=token_addr, abi=erc20_abi)
            if sale_mode == 1:  # Vested
                vault_addr = sale_contract.functions.vault().call()
                balance = token_contract.functions.balanceOf(vault_addr).call()
            else:  # Direct
                balance = token_contract.functions.balanceOf(w3.to_checksum_address(sale.contract_address)).call()

            if balance == 0:
                raise HTTPException(status_code=400, detail={
                    "code": "TOKENS_NOT_DEPOSITED",
                    "message": "Project tokens must be deposited before submitting for approval. Complete the 'Deposit Project Tokens' step.",
                })
        except HTTPException:
            raise
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("On-chain check failed for sale %s: %s", sale_id, e)
            # Don't block submission if RPC check fails — admin can verify manually

    sale.status = SaleStatus.PENDING_APPROVAL
    await sale_service.db.commit()
    return {"sale_id": str(sale_id), "status": "pending_approval", "message": "Sale submitted for admin approval"}


@router.post("/{sale_id}/record-deployment")
async def record_sale_deployment(
    sale_id: UUID,
    user_id: CurrentUserId,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
    tx_hash: str = Query(..., min_length=66, max_length=66),
) -> dict:
    """Record on-chain sale deployment by parsing the tx receipt.

    Frontend sends the tx_hash after deploying via wallet.
    Backend reads the receipt and extracts SaleDeployed event.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.issuer))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    try:
        from web3 import Web3

        from apps.api.services.web3_base_service import Web3BaseService

        w3_svc = Web3BaseService()
        w3 = w3_svc.w3
        receipt = w3.eth.get_transaction_receipt(tx_hash)

        # SaleDeployed(address indexed token, address indexed sale, address indexed issuer)
        sale_deployed_topic = Web3.keccak(text="SaleDeployed(address,address,address)").hex()

        sale_address = None
        for log in receipt.logs:
            if len(log.topics) >= 3 and log.topics[0].hex() == sale_deployed_topic:
                # topics[1]=token, topics[2]=sale, topics[3]=issuer
                sale_address = Web3.to_checksum_address("0x" + log.topics[2].hex()[-40:])
                break

        if not sale_address:
            raise HTTPException(status_code=400, detail={"code": "EVENT_NOT_FOUND", "message": "SaleDeployed event not found in tx"})

        sale.contract_address = sale_address
        await db.commit()

        return {"sale_id": str(sale_id), "contract_address": sale_address, "tx_hash": tx_hash}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"code": "CHAIN_ERROR", "message": f"Failed to read tx receipt: {exc}"}) from exc


@router.post("/{sale_id}/convert-to-live")
async def convert_coming_soon_to_live(
    sale_id: UUID,
    user_id: CurrentUserId,
    sale_service: Annotated[SaleService, Depends(get_sale_service)],
) -> dict:
    """Convert a Coming Soon sale back to DRAFT for the issuer to add
    token, phases, caps and resubmit for approval as a live sale.

    Requires: issuer (must own the sale).
    """
    from fastapi import HTTPException
    from sqlalchemy.orm import selectinload

    result = await sale_service.db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.issuer))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})
    if sale.status != SaleStatus.APPROVED_COMING_SOON:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": f"Sale must be APPROVED_COMING_SOON, currently: {sale.status}"})

    sale.is_coming_soon = False
    sale.status = SaleStatus.DRAFT
    await sale_service.db.commit()
    return {"sale_id": str(sale_id), "status": "draft", "message": "Sale converted to draft — add token, phases, and resubmit for approval"}


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


# ── Round-5 lifecycle endpoints ─────────────────────────────────────────────


@router.post("/{sale_id}/approve", status_code=200)
async def approve_sale(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Round-5: admin approves a sale (compliance gate). Issuer can then activate.

    Requires: admin role.
    """
    from datetime import datetime

    from apps.api.models.user import User

    # Verify caller is admin
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail={"code": "NOT_ADMIN", "message": "Admin role required"})

    sale_result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id))
    sale = sale_result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    if sale.approved_at is not None:
        raise HTTPException(status_code=400, detail={"code": "ALREADY_APPROVED", "message": "Sale is already approved"})

    sale.approved_at = datetime.now(UTC)
    await db.commit()
    return {"sale_id": str(sale_id), "approved_at": sale.approved_at.isoformat()}


@router.post("/{sale_id}/unapprove", status_code=200)
async def unapprove_sale(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Round-5: admin revokes approval before issuer activates. Admin only."""
    from apps.api.models.user import User

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail={"code": "NOT_ADMIN", "message": "Admin role required"})

    sale_result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id))
    sale = sale_result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    if sale.activated_at is not None:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALREADY_ACTIVE", "message": "Cannot revoke approval after activation"},
        )

    sale.approved_at = None
    await db.commit()
    return {"sale_id": str(sale_id), "approved": False}


@router.post("/{sale_id}/activate-refunds", status_code=200)
async def activate_refunds(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Round-5: issuer or admin activates the refund window after a failed sale.
    Mirrors Sale.activateRefunds() on-chain. One-way switch.
    """
    from datetime import datetime

    from sqlalchemy.orm import selectinload

    sale_result = await db.execute(
        select(TokenSale).options(selectinload(TokenSale.issuer)).where(TokenSale.id == sale_id)
    )
    sale = sale_result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})

    # Authorization: issuer-or-admin
    is_issuer = sale.issuer.user_id == user_id
    if not is_issuer:
        from apps.api.models.user import User
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user or not getattr(user, "is_admin", False):
            raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Issuer or admin only"})

    if sale.refunds_activated_at is not None:
        raise HTTPException(status_code=400, detail={"code": "ALREADY_ACTIVE", "message": "Refunds already active"})

    sale.refunds_activated_at = datetime.now(UTC)
    await db.commit()
    return {"sale_id": str(sale_id), "refunds_activated_at": sale.refunds_activated_at.isoformat()}


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
    tx_hash: str | None = Query(None, description="On-chain refund tx hash from Sale.claimRefund()"),
) -> list[ContributionResponse]:
    """Record a trustless refund from an on-chain Sale.claimRefund() call.

    Investor calls Sale.claimRefund() on-chain via wallet, then passes
    tx_hash here for backend verification and DB update.
    """
    contributions = await sale_service.claim_refund(user_id, sale_id, tx_hash=tx_hash)
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

    sale_result = await db.execute(
        select(TokenSale).where(TokenSale.id == sale_id, TokenSale.issuer_id == issuer.id)
    )
    sale = sale_result.scalar_one_or_none()
    if not sale:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Sale not found")

    # Look up investor by wallet address to attribute contribution correctly
    from apps.api.models.wallet import Wallet

    wallet_result = await db.execute(
        select(Wallet).where(Wallet.address == request.investor_wallet)
    )
    investor_wallet = wallet_result.scalar_one_or_none()
    investor_user_id = investor_wallet.user_id if investor_wallet else user_id

    # Create OTC contribution (is_otc=True, excluded from fee base)
    contrib = Contribution()
    contrib.user_id = investor_user_id  # attribute to investor if found, else issuer
    contrib.sale_id = sale_id
    contrib.phase_id = (
        (
            await db.execute(
                select(SalePhase)
                .where(SalePhase.sale_id == sale_id)
                .order_by(SalePhase.phase_number)
                .limit(1)
            )
        )
        .scalar_one()
        .id
    )
    contrib.amount = Decimal("0")  # OTC — no on-platform USDC
    contrib.tokens_allocated = Decimal(str(request.token_amount))
    contrib.tx_hash = (
        f"otc-{sale_id}-{request.investor_wallet[:8]}-{int(__import__('time').time())}"
    )
    contrib.is_otc = True
    contrib.otc_reference = request.payment_reference
    contrib.wallet_address = request.investor_wallet
    contrib.status = "confirmed"

    # Update sale total (OTC counts toward hard cap but NOT toward on-platform total)
    sale.total_raised += Decimal("0")  # OTC doesn't change USDC raised

    db.add(contrib)
    await db.commit()
    return {"message": "OTC allocation recorded", "tokens_allocated": str(request.token_amount)}
