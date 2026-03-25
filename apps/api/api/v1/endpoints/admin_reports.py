"""Admin reports endpoints — CSV exports for sales, holders, fees, compliance."""

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.audit_log import AuditLog
from apps.api.models.contribution import Contribution
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin-reports"])


def _csv_response(filename: str, rows: list[dict], fieldnames: list[str]) -> StreamingResponse:
    """Build a CSV StreamingResponse from a list of dicts."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/issuer/reports/sales")
async def export_sales_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Sales report CSV: per-sale breakdown of contributions, phases, and OTC."""
    result = await db.execute(
        select(TokenSale)
        .options(
            selectinload(TokenSale.token),
            selectinload(TokenSale.contributions),
            selectinload(TokenSale.phases),
        )
    )
    sales = result.scalars().all()

    rows = []
    for sale in sales:
        token_name = sale.token.name if sale.token else "N/A"
        token_symbol = sale.token.symbol if sale.token else "N/A"
        contributions = sale.contributions or []
        total_contrib = sum(c.amount for c in contributions)
        otc_count = sum(1 for c in contributions if c.is_otc)
        direct_count = len(contributions) - otc_count
        rows.append({
            "sale_id": str(sale.id),
            "token": f"{token_name} ({token_symbol})",
            "status": sale.status,
            "mode": (sale.sale_mode.value if hasattr(sale.sale_mode, "value") else str(sale.sale_mode)),
            "soft_cap": str(sale.soft_cap),
            "hard_cap": str(sale.hard_cap),
            "total_raised": str(sale.total_raised),
            "total_raised_on_platform": str(getattr(sale, "total_raised_on_platform", 0)),
            "platform_fee_collected": str(sale.platform_fee_collected),
            "total_contributions": len(contributions),
            "direct_contributions": direct_count,
            "otc_contributions": otc_count,
            "phases": len(sale.phases or []),
            "sale_contract": sale.contract_address or "not deployed",
        })

    fieldnames = [
        "sale_id", "token", "status", "mode", "soft_cap", "hard_cap",
        "total_raised", "total_raised_on_platform", "platform_fee_collected",
        "total_contributions", "direct_contributions", "otc_contributions",
        "phases", "sale_contract",
    ]
    return _csv_response("cireta-sales-report.csv", rows, fieldnames)


@router.get("/issuer/reports/holders")
async def export_holders_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Holder report CSV: current cap table — all token holders and balances."""
    result = await db.execute(
        select(Contribution)
        .options(
            selectinload(Contribution.user),
            selectinload(Contribution.sale).selectinload(TokenSale.token),
        )
        .where(Contribution.status == "claimed")
    )
    contributions = result.scalars().all()

    rows = []
    for c in contributions:
        user_email = c.user.email if c.user else "N/A"
        token_symbol = (c.sale.token.symbol if c.sale and c.sale.token else "N/A")
        rows.append({
            "user_email": user_email,
            "token": token_symbol,
            "amount_contributed": str(c.amount),
            "tokens_allocated": str(c.tokens_allocated or 0),
            "wallet_address": c.wallet_address or "N/A",
            "tx_hash": c.tx_hash or "N/A",
            "claimed_at": str(c.claimed_at or ""),
            "is_otc": "yes" if c.is_otc else "no",
        })

    fieldnames = [
        "user_email", "token", "amount_contributed", "tokens_allocated",
        "wallet_address", "tx_hash", "claimed_at", "is_otc",
    ]
    return _csv_response("cireta-holders-report.csv", rows, fieldnames)


@router.get("/issuer/reports/fees")
async def export_fees_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Fee report CSV: platform fees deducted per sale."""
    result = await db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.token))
        .where(TokenSale.platform_fee_collected > 0)
    )
    sales = result.scalars().all()

    rows = []
    for sale in sales:
        token_symbol = sale.token.symbol if sale.token else "N/A"
        rows.append({
            "sale_id": str(sale.id),
            "token": token_symbol,
            "total_raised": str(sale.total_raised),
            "platform_fee_bps": str(sale.platform_fee_bps),
            "fee_cap_usdc": str(sale.fee_cap_usdc or "none"),
            "platform_fee_collected": str(sale.platform_fee_collected),
            "status": sale.status,
        })

    fieldnames = [
        "sale_id", "token", "total_raised", "platform_fee_bps",
        "fee_cap_usdc", "platform_fee_collected", "status",
    ]
    return _csv_response("cireta-fees-report.csv", rows, fieldnames)


@router.get("/issuer/reports/compliance")
async def export_compliance_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Compliance report CSV: frozen addresses, forced transfers, recovery actions."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc())
    )
    logs = result.scalars().all()

    # Collect actor_ids and batch-fetch emails
    actor_ids = {log.actor_id for log in logs if log.actor_id}
    actor_map: dict = {}
    if actor_ids:
        user_result = await db.execute(
            select(User.id, User.email).where(User.id.in_(actor_ids))
        )
        actor_map = {str(row.id): row.email for row in user_result}

    rows = []
    for log in logs:
        actor_email = actor_map.get(str(log.actor_id), "system") if log.actor_id else "system"
        rows.append({
            "timestamp": str(log.created_at),
            "action": log.action,
            "target_type": log.target_type or "N/A",
            "target_id": log.target_id or "N/A",
            "actor": actor_email,
            "ip_address": log.ip_address or "N/A",
            "reason": log.reason or "",
        })

    fieldnames = [
        "timestamp", "action", "target_type", "target_id",
        "actor", "ip_address", "reason",
    ]
    return _csv_response("cireta-compliance-report.csv", rows, fieldnames)
