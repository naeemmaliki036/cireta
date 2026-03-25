"""Admin reports endpoints — CSV exports for sales, holders, fees, compliance.

Security: all cells are sanitized against CSV injection (Excel formula execution)
via _sanitize_cell(). All endpoints require platform admin role.
"""

import csv
import io
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.audit_log import AuditLog
from apps.api.models.contribution import Contribution
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin-reports"])

# Maximum rows per report to prevent OOM on large datasets
_MAX_REPORT_ROWS = 10_000


def _sanitize_cell(value: str) -> str:
    """Prevent CSV injection by prefixing dangerous characters with a single quote.

    Excel/Sheets execute formulas starting with = + - @ |
    Ref: OWASP CSV Injection
    """
    if isinstance(value, str) and value and value[0] in ("=", "+", "-", "@", "|", "\t", "\r", "\n"):
        return f"'{value}"
    return value


def _csv_response(filename: str, rows: list[dict], fieldnames: list[str]) -> StreamingResponse:
    """Build a CSV StreamingResponse from a list of dicts, sanitized against injection."""
    # Sanitize all string cells
    sanitized = []
    for row in rows:
        sanitized.append({k: _sanitize_cell(str(v)) if isinstance(v, str) else v for k, v in row.items()})

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(sanitized)
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
    limit: int = Query(default=_MAX_REPORT_ROWS, le=_MAX_REPORT_ROWS),
) -> StreamingResponse:
    """Sales report CSV: per-sale breakdown of contributions, phases, and OTC."""
    result = await db.execute(
        select(TokenSale)
        .options(
            selectinload(TokenSale.token),
            selectinload(TokenSale.contributions),
            selectinload(TokenSale.phases),
        )
        .limit(limit)
    )
    sales = result.scalars().all()

    rows = []
    for sale in sales:
        token_name = sale.token.name if sale.token else "N/A"
        token_symbol = sale.token.symbol if sale.token else "N/A"
        contributions = sale.contributions or []
        rows.append({
            "Sale": f"{token_name} Sale",
            "Token": token_symbol,
            "Status": (sale.status.value if hasattr(sale.status, "value") else str(sale.status)),
            "Soft Cap": str(sale.soft_cap),
            "Hard Cap": str(sale.hard_cap),
            "Total Raised": str(sale.total_raised_on_platform),
            "Fee Collected": str(sale.platform_fee_collected),
            "Contributors": len(contributions),
            "Created": str(sale.created_at) if sale.created_at else "",
        })

    fieldnames = [
        "Sale", "Token", "Status", "Soft Cap", "Hard Cap",
        "Total Raised", "Fee Collected", "Contributors", "Created",
    ]
    return _csv_response("cireta-sales-report.csv", rows, fieldnames)


@router.get("/issuer/reports/holders")
async def export_holders_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_MAX_REPORT_ROWS, le=_MAX_REPORT_ROWS),
) -> StreamingResponse:
    """Holder report CSV: current cap table — all token holders and balances."""
    from apps.api.models.enums import ContributionStatus

    result = await db.execute(
        select(Contribution)
        .options(
            selectinload(Contribution.user),
            selectinload(Contribution.sale).selectinload(TokenSale.token),
        )
        .where(Contribution.status == ContributionStatus.CLAIMED)
        .limit(limit)
    )
    contributions = result.scalars().all()

    rows = []
    for c in contributions:
        user_email = c.user.email if c.user else "N/A"
        token_name = (c.sale.token.name if c.sale and c.sale.token else "N/A")
        rows.append({
            "Investor Email": user_email,
            "Token": token_name,
            "Amount Claimed": str(c.tokens_allocated or 0),
            "Claimed At": str(c.claimed_at or ""),
        })

    fieldnames = ["Investor Email", "Token", "Amount Claimed", "Claimed At"]
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
        token_name = sale.token.name if sale.token else "N/A"
        token_symbol = sale.token.symbol if sale.token else "N/A"
        rows.append({
            "Sale": f"{token_name} Sale",
            "Token": token_symbol,
            "Fee BPS": str(sale.platform_fee_bps),
            "Fee Collected (USDC)": str(sale.platform_fee_collected),
            "Total Raised": str(sale.total_raised),
            "Created": str(sale.created_at) if sale.created_at else "",
        })

    fieldnames = [
        "Sale", "Token", "Fee BPS", "Fee Collected (USDC)", "Total Raised", "Created",
    ]
    return _csv_response("cireta-fees-report.csv", rows, fieldnames)


@router.get("/issuer/reports/compliance")
async def export_compliance_report(
    _user_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=_MAX_REPORT_ROWS, le=_MAX_REPORT_ROWS),
) -> StreamingResponse:
    """Compliance report CSV: frozen addresses, forced transfers, recovery actions."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
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
            "Action": log.action,
            "Target Type": log.target_type or "N/A",
            "Target": log.target_id or "N/A",
            "Actor": actor_email,
            "Reason": log.reason or "",
            "IP Address": log.ip_address or "N/A",
            "Timestamp": str(log.created_at),
        })

    fieldnames = [
        "Action", "Target Type", "Target", "Actor", "Reason", "IP Address", "Timestamp",
    ]
    return _csv_response("cireta-compliance-report.csv", rows, fieldnames)
