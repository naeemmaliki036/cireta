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
    return HoldingResponse(
        token_id=holding["token_id"],
        token_symbol=holding["token_symbol"],
        token_name=holding["token_name"],
        balance=str(holding["balance"]),
        vested_amount=str(holding["vested_amount"]),
        claimable_amount=str(holding["claimable_amount"]),
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
        fulfillment_method=(redemption.fulfillment_method.value if hasattr(redemption.fulfillment_method, "value") else redemption.fulfillment_method),
        status=(redemption.status.value if hasattr(redemption.status, "value") else redemption.status),
        tx_hash=redemption.tx_hash,
        fulfilled_at=redemption.fulfilled_at,
        notes=redemption.notes,
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
        fulfillment_method=(request.fulfillment_method.value if hasattr(request.fulfillment_method, "value") else request.fulfillment_method),
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


@router.get("/dividends")
async def get_dividends(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get claimable dividends for user's token holdings."""
    # Returns distributions keyed by token - on-chain claimable amounts
    # would be read via web3 in production; return DB records for now

    return {
        "dividends": [],
        "total_claimable_usdc": "0",
        "note": "Connect DividendDistributor contract to read live claimable amounts",
    }


@router.get("/transactions")
async def get_transactions(
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),  # noqa: ARG001 — pagination TODO
) -> dict:
    """Get transaction history for current user."""
    from sqlalchemy import select

    from apps.api.models.contribution import Contribution
    from apps.api.models.redemption_request import RedemptionRequest

    txs = []

    contribs = await db.execute(
        select(Contribution).where(Contribution.user_id == user_id)
        .order_by(Contribution.created_at.desc()).limit(limit)
    )
    for c in contribs.scalars().all():
        txs.append({
            "type": "investment",
            "amount": str(c.amount),
            "tx_hash": c.tx_hash,
            "status": c.status if isinstance(c.status, str) else c.status.value,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    redemptions = await db.execute(
        select(RedemptionRequest).where(RedemptionRequest.user_id == user_id)
        .order_by(RedemptionRequest.created_at.desc()).limit(limit)
    )
    for r in redemptions.scalars().all():
        txs.append({
            "type": "redemption",
            "amount": str(r.amount),
            "tx_hash": r.tx_hash,
            "status": r.status if isinstance(r.status, str) else r.status.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    txs.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return {"transactions": txs[:limit], "total": len(txs)}
