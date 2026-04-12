"""Portfolio endpoints for user holdings, vesting, and redemptions."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.portfolio import (
    HoldingResponse,
    PortfolioSummaryResponse,
    RedemptionCreateRequest,
    RedemptionResponse,
    VaultClaimableResponse,
    VestingClaimResponse,
    VestingScheduleResponse,
)
from apps.api.services.portfolio_service import PortfolioService
from apps.api.services.redemption_service import RedemptionService
from apps.api.services.vesting_service import VestingService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


async def get_portfolio_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PortfolioService:
    """Get portfolio service instance."""
    return PortfolioService(db)


async def get_vesting_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VestingService:
    """Get vesting service instance."""
    return VestingService(db)


async def get_redemption_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RedemptionService:
    """Get redemption service instance."""
    return RedemptionService(db)


def _holding_to_response(holding: dict) -> HoldingResponse:
    """Convert holding dict to response."""
    balance = holding["balance"]
    invested = holding.get("invested_usd", balance)
    return HoldingResponse(
        token_id=holding["token_id"],
        token_symbol=holding["token_symbol"],
        token_name=holding["token_name"],
        asset_type=holding.get("asset_type", "commodity"),
        balance=str(balance),
        value_usd=str(invested),
        vested_amount=str(holding["vested_amount"]),
        claimable_amount=str(holding["claimable_amount"]),
        claimable=str(holding["claimable_amount"]),
        locked=bool(holding.get("locked", False)),
        is_redeemable=bool(holding.get("is_redeemable", False)),
    )


def _vesting_to_response(schedule) -> VestingScheduleResponse:
    """Convert vesting schedule to response."""
    return VestingScheduleResponse(
        id=str(schedule.id),
        token_id=str(schedule.token_id),
        token_symbol=schedule.token.symbol,
        total_amount=str(schedule.total_amount),
        claimed_amount=str(schedule.claimed_amount),
        remaining_amount=str(schedule.remaining_amount),
        claimable_amount=str(schedule.claimable_amount),
        cliff_end=schedule.cliff_end,
        vesting_end=schedule.vesting_end,
        cliff_passed=schedule.cliff_passed,
        last_claim_at=schedule.last_claim_at,
    )


def _redemption_to_response(redemption) -> RedemptionResponse:
    """Convert redemption request to response."""
    return RedemptionResponse(
        id=str(redemption.id),
        token_id=str(redemption.token_id),
        token_symbol=redemption.token.symbol,
        amount=str(redemption.amount),
        fulfillment_method=(
            redemption.fulfillment_method.value
            if hasattr(redemption.fulfillment_method, "value")
            else redemption.fulfillment_method
        ),
        status=(
            redemption.status.value if hasattr(redemption.status, "value") else redemption.status
        ),
        tx_hash=redemption.tx_hash,
        fulfilled_at=redemption.fulfilled_at,
        notes=redemption.notes,
        tracking_number=redemption.tracking_number,
        shipped_at=redemption.shipped_at,
        delivery_name=redemption.delivery_name,
        delivery_address=redemption.delivery_address,
        delivery_phone=redemption.delivery_phone,
        created_at=redemption.created_at,
    )


@router.get("/holdings", response_model=list[HoldingResponse])
async def get_holdings(
    user_id: CurrentUserId,
    portfolio_service: Annotated[PortfolioService, Depends(get_portfolio_service)],
) -> list[HoldingResponse]:
    """Get user's token holdings.

    Aggregates holdings from claimed contributions and vesting.
    """
    holdings = await portfolio_service.get_holdings(user_id)
    return [_holding_to_response(h) for h in holdings]


@router.get("/summary", response_model=PortfolioSummaryResponse)
async def get_portfolio_summary(
    user_id: CurrentUserId,
    portfolio_service: Annotated[PortfolioService, Depends(get_portfolio_service)],
) -> PortfolioSummaryResponse:
    """Get comprehensive portfolio summary."""
    summary = await portfolio_service.get_portfolio_summary(user_id)
    return PortfolioSummaryResponse(
        total_holdings=summary["total_holdings"],
        total_vesting_schedules=summary["total_vesting_schedules"],
        total_pending_redemptions=summary["total_pending_redemptions"],
        total_value_usd=str(summary.get("total_value_usd", "0")),
        total_invested_usd=str(summary.get("total_invested_usd", "0")),
        holdings=[_holding_to_response(h) for h in summary["holdings"]],
    )


@router.get("/vesting", response_model=list[VestingScheduleResponse])
async def get_vesting_schedules(
    user_id: CurrentUserId,
    vesting_service: Annotated[VestingService, Depends(get_vesting_service)],
) -> list[VestingScheduleResponse]:
    """Get user's vesting schedules."""
    schedules = await vesting_service.get_user_schedules(user_id)
    return [_vesting_to_response(s) for s in schedules]


@router.post("/vesting/{schedule_id}/claim", response_model=VestingClaimResponse)
async def claim_vesting(
    schedule_id: UUID,
    user_id: CurrentUserId,
    vesting_service: Annotated[VestingService, Depends(get_vesting_service)],
) -> VestingClaimResponse:
    """Claim available vested tokens."""
    schedule, claimed_amount = await vesting_service.claim_tranche(schedule_id, user_id)

    return VestingClaimResponse(
        schedule_id=str(schedule.id),
        claimed_amount=str(claimed_amount),
        remaining_amount=str(schedule.remaining_amount),
        tx_hash=None,  # TODO: Web3 integration
    )


@router.get("/redemptions", response_model=list[RedemptionResponse])
async def get_redemptions(
    user_id: CurrentUserId,
    redemption_service: Annotated[RedemptionService, Depends(get_redemption_service)],
) -> list[RedemptionResponse]:
    """Get user's redemption requests."""
    requests = await redemption_service.get_user_requests(user_id)
    return [_redemption_to_response(r) for r in requests]


@router.post(
    "/redemptions",
    response_model=RedemptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_redemption(
    request: RedemptionCreateRequest,
    user_id: CurrentUserId,
    redemption_service: Annotated[RedemptionService, Depends(get_redemption_service)],
) -> RedemptionResponse:
    """Create a new redemption request.

    Requires: kyc_level >= 2.
    """
    redemption = await redemption_service.create_request(
        user_id=user_id,
        token_id=UUID(request.token_id),
        amount=request.amount,
        fulfillment_method=(
            request.fulfillment_method.value
            if hasattr(request.fulfillment_method, "value")
            else request.fulfillment_method
        ),
        notes=request.notes,
    )

    # Load token relationship for response
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from apps.api.models.redemption_request import RedemptionRequest

    result = await redemption_service.db.execute(
        select(RedemptionRequest)
        .options(selectinload(RedemptionRequest.token))
        .where(RedemptionRequest.id == redemption.id)
    )
    redemption = result.scalar_one()

    return _redemption_to_response(redemption)


@router.get("/vesting/{sale_id}/claimable", response_model=VaultClaimableResponse)
async def get_vault_claimable(
    sale_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VaultClaimableResponse:
    """Get on-chain claimable amount from CiretaVault for a vested sale."""
    from sqlalchemy import select

    from apps.api.models.token_sale import TokenSale
    from apps.api.models.wallet import Wallet
    from apps.api.services.web3_vault_service import Web3VaultService

    # Get sale vault address
    result = await db.execute(select(TokenSale).where(TokenSale.id == sale_id))
    sale = result.scalar_one_or_none()
    if not sale or not sale.vault_address:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Sale not found or has no vault")

    # Get user wallet address
    result = await db.execute(
        select(Wallet).where(Wallet.user_id == user_id, Wallet.is_primary == True)  # noqa: E712
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No wallet found for user")

    vault_svc = Web3VaultService()
    claimable = await vault_svc.get_claimable(sale.vault_address, wallet.address)
    vesting_info = await vault_svc.get_vesting_info(sale.vault_address, wallet.address)

    return VaultClaimableResponse(
        sale_id=str(sale_id),
        vault_address=sale.vault_address,
        investor_address=wallet.address,
        claimable=str(claimable),
        total_fractions=str(vesting_info["total_fractions"]),
        claimed_amount=str(vesting_info["claimed_amount"]),
        vested=str(vesting_info["vested"]),
        finalized=vesting_info["finalized"],
        cliff_duration=vesting_info["cliff_duration"],
        vesting_duration=vesting_info["vesting_duration"],
        vesting_start_time=vesting_info["vesting_start_time"],
    )


@router.get("/dividends")
async def get_dividends(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get claimable dividends for user's token holdings.

    Reads on-chain claimable amounts from DividendDistributor contracts.
    """
    from apps.api.services.dividend_service import DividendService

    svc = DividendService(db)
    dividends = await svc.get_claimable_dividends(user_id)

    total_claimable = sum(
        float(d.get("claimable_usdc", "0")) for d in dividends
    )
    return {
        "dividends": dividends,
        "total_claimable_usdc": str(total_claimable),
    }


@router.get("/transactions")
async def get_transactions(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    token_id: UUID | None = Query(None),
    tx_type: str | None = Query(None, alias="type"),
) -> dict:
    """Get transaction history for current user.

    Supports filtering by token_id and type (investment/claim/redemption/refund).
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from apps.api.models.contribution import Contribution
    from apps.api.models.redemption_request import RedemptionRequest

    txs: list[dict] = []

    # --- Contributions (investment, claim, refund) ---
    include_contribs = tx_type in (None, "investment", "claim", "refund")
    if include_contribs:
        from apps.api.models.token_sale import TokenSale as _TS

        contrib_q = (
            select(Contribution)
            .options(
                selectinload(Contribution.sale).selectinload(_TS.token)
            )
            .where(Contribution.user_id == user_id)
        )
        if token_id:
            contrib_q = contrib_q.join(Contribution.sale).where(
                _TS.token_id == token_id
            )
        contribs = await db.execute(
            contrib_q.order_by(Contribution.created_at.desc())
        )
        for c in contribs.scalars().all():
            # Determine transaction type from status
            c_status = c.status if isinstance(c.status, str) else c.status.value
            if c_status == "refunded":
                c_type = "refund"
            elif c_status == "claimed":
                c_type = "claim"
            else:
                c_type = "investment"

            if tx_type and c_type != tx_type:
                continue

            token_sym = ""
            token_name_val = ""
            sale_token_id = None
            if c.sale:
                sale_token_id = str(c.sale.token_id) if c.sale.token_id else None
                if c.sale.token:
                    token_sym = c.sale.token.symbol or ""
                    token_name_val = c.sale.token.name or ""
                else:
                    token_name_val = c.sale.title or ""

            txs.append(
                {
                    "id": str(c.id),
                    "type": c_type,
                    "amount": str(c.amount),
                    "tokens_allocated": str(c.tokens_allocated),
                    "token_symbol": token_sym,
                    "token_name": token_name_val,
                    "token_id": sale_token_id,
                    "tx_hash": c.claim_tx_hash if c_type == "claim" else c.tx_hash,
                    "status": c_status,
                    "is_otc": bool(getattr(c, "is_otc", False)),
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
            )

    # --- Redemptions ---
    include_redemptions = tx_type in (None, "redemption")
    if include_redemptions:
        redemption_q = (
            select(RedemptionRequest)
            .options(selectinload(RedemptionRequest.token))
            .where(RedemptionRequest.user_id == user_id)
        )
        if token_id:
            redemption_q = redemption_q.where(RedemptionRequest.token_id == token_id)
        redemptions = await db.execute(
            redemption_q.order_by(RedemptionRequest.created_at.desc())
        )
        for r in redemptions.scalars().all():
            r_status = r.status if isinstance(r.status, str) else r.status.value
            token_sym = r.token.symbol if r.token else ""
            token_name = r.token.name if r.token else ""

            txs.append(
                {
                    "id": str(r.id),
                    "type": "redemption",
                    "amount": str(r.amount),
                    "tokens_allocated": str(r.amount),
                    "token_symbol": token_sym,
                    "token_name": token_name,
                    "token_id": str(r.token_id),
                    "tx_hash": r.tx_hash,
                    "status": r_status,
                    "is_otc": False,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )

    # Sort by date descending and apply pagination
    txs.sort(key=lambda x: x["created_at"] or "", reverse=True)
    total = len(txs)
    txs = txs[offset : offset + limit]
    return {"transactions": txs, "total": total}
