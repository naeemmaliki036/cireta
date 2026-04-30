"""Error-report endpoints — public submission + admin listing."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.error_report import ErrorReport
from apps.api.models.user import User
from apps.api.services.error_report_service import ErrorReportService
from packages.common.core.auth_deps import OptionalUserId, RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["error-reports"])


class ErrorReportCreate(BaseModel):
    """Payload from the UI's 'Report this issue' button."""

    tx_hash: str | None = Field(default=None, max_length=66)
    contract_address: str | None = Field(default=None, max_length=42)
    function_name: str | None = Field(default=None, max_length=100)
    chain_id: int | None = None
    error_code: str | None = Field(default=None, max_length=100)
    error_message: str | None = Field(default=None, max_length=4000)
    page_url: str | None = Field(default=None, max_length=500)
    additional_details: str | None = Field(default=None, max_length=4000)


class ErrorReportPublicResponse(BaseModel):
    id: str
    email_status: str | None


class ErrorReportAdminItem(BaseModel):
    id: str
    created_at: datetime
    user_id: str | None = None
    user_email: str | None = None
    wallet_address: str | None = None
    tx_hash: str | None = None
    contract_address: str | None = None
    function_name: str | None = None
    chain_id: int | None = None
    error_code: str | None = None
    error_message: str | None = None
    page_url: str | None = None
    user_agent: str | None = None
    additional_details: str | None = None
    recipient_email: str | None = None
    email_status: str | None = None


class ErrorReportAdminListResponse(BaseModel):
    items: list[ErrorReportAdminItem]
    total: int
    page: int
    size: int


def _to_admin_item(r: ErrorReport) -> ErrorReportAdminItem:
    return ErrorReportAdminItem(
        id=str(r.id),
        created_at=r.created_at,
        user_id=str(r.user_id) if r.user_id else None,
        user_email=r.user_email,
        wallet_address=r.wallet_address,
        tx_hash=r.tx_hash,
        contract_address=r.contract_address,
        function_name=r.function_name,
        chain_id=r.chain_id,
        error_code=r.error_code,
        error_message=r.error_message,
        page_url=r.page_url,
        user_agent=r.user_agent,
        additional_details=r.additional_details,
        recipient_email=r.recipient_email,
        email_status=r.email_status,
    )


@router.post("/error-reports", response_model=ErrorReportPublicResponse, status_code=201)
async def submit_error_report(
    payload: ErrorReportCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: OptionalUserId = None,
) -> ErrorReportPublicResponse:
    """Public endpoint — anyone with or without auth can submit a report.

    The button is normally only shown to authenticated users, but we
    accept anonymous submissions too so an unauthenticated buyer who hit
    a tx revert isn't lost. user_email/wallet_address are pulled from
    the authenticated user when available.
    """
    user_email: str | None = None
    wallet_address: str | None = None
    if user_id is not None:
        result = await db.execute(
            select(User).options(selectinload(User.wallets)).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user_email = user.email
            primary_wallet = next(
                (w for w in (user.wallets or []) if w.is_primary),
                next(iter(user.wallets or []), None),
            )
            wallet_address = primary_wallet.address if primary_wallet else None

    user_agent = request.headers.get("user-agent", "")[:500] or None

    svc = ErrorReportService(db)
    report = await svc.create_and_notify(
        user_id=user_id,
        user_email=user_email,
        wallet_address=wallet_address,
        tx_hash=payload.tx_hash,
        contract_address=payload.contract_address,
        function_name=payload.function_name,
        chain_id=payload.chain_id,
        error_code=payload.error_code,
        error_message=payload.error_message,
        page_url=payload.page_url,
        user_agent=user_agent,
        additional_details=payload.additional_details,
    )
    return ErrorReportPublicResponse(id=str(report.id), email_status=report.email_status)


@router.get(
    "/admin/error-reports",
    response_model=ErrorReportAdminListResponse,
)
async def list_error_reports(
    _admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=200),
    function_name: str | None = None,
    has_tx: bool | None = None,
) -> ErrorReportAdminListResponse:
    """Admin-only listing of submitted error reports, newest first."""
    query = select(ErrorReport)
    count_query = select(func.count()).select_from(ErrorReport)

    if function_name:
        query = query.where(ErrorReport.function_name == function_name)
        count_query = count_query.where(ErrorReport.function_name == function_name)
    if has_tx is True:
        query = query.where(ErrorReport.tx_hash.is_not(None))
        count_query = count_query.where(ErrorReport.tx_hash.is_not(None))
    elif has_tx is False:
        query = query.where(ErrorReport.tx_hash.is_(None))
        count_query = count_query.where(ErrorReport.tx_hash.is_(None))

    total = (await db.execute(count_query)).scalar() or 0
    query = (
        query.order_by(desc(ErrorReport.created_at))
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(query)).scalars().all()
    return ErrorReportAdminListResponse(
        items=[_to_admin_item(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )
