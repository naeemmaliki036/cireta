"""Admin investors endpoint — list users with investor role."""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import UserRole
from apps.api.models.user import User
from packages.common.core.auth_deps import RequireAdmin, RequireIssuerOrAdmin
from packages.common.core.config import settings
from packages.common.db.session import get_db

log = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


class HoldingResponse(BaseModel):
    sale_id: str
    sale_name: str
    token_symbol: str | None = None
    tokens_held: str               # Decimal serialized as string for precision
    contributed_usdc: str          # Decimal serialized as string
    claim_status: str              # "pending" | "claimed" | "refunded"


class BeneficialOwnerResponse(BaseModel):
    name: str
    ownership_pct: str | None = None


class InvestorResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    investor_type: str | None = None
    kyc_status: str
    kyc_level: int
    onchain_id: str | None
    wallet_address: str | None
    wallet_count: int = 0
    onboarding_completed: bool = False
    email_verified: bool = False
    created_at: datetime

    # Self-reported (typed at onboarding)
    date_of_birth: str | None = None
    nationality: str | None = None
    country_of_residence: str | None = None
    phone_number: str | None = None
    company_name: str | None = None
    company_registration_number: str | None = None
    company_jurisdiction: str | None = None

    # Sumsub-verified mirror
    verified_full_name: str | None = None
    verified_date_of_birth: str | None = None
    verified_nationality: str | None = None
    verified_country_of_residence: str | None = None
    verified_phone_number: str | None = None
    verified_company_name: str | None = None
    verified_company_registration_number: str | None = None
    verified_company_jurisdiction: str | None = None
    verified_beneficial_owners: list[BeneficialOwnerResponse] | None = None
    kyc_synced_at: datetime | None = None

    # Activity (aggregated from sale_contributions)
    participation_count: int = 0
    total_contributed_usdc: str = "0"
    top_holdings: list[HoldingResponse] = []

    class Config:
        from_attributes = True


class InvestorDetailResponse(InvestorResponse):
    kyc_provider: str | None = None
    kyc_verified_at: datetime | None = None
    is_accredited: bool = False
    wallets: list[dict] = []
    holdings: list[HoldingResponse] = []   # full list, no cap
    identity_mode: str = "simple"          # "simple" | "erc3643" — mirrors IDENTITY_MODE env var


class InvestorListResponse(BaseModel):
    items: list[InvestorResponse]
    total: int
    page: int
    size: int


def _build_investor_response(
    u: User,
    holdings: list[HoldingResponse],
    contributed_total: str,
    *,
    holdings_cap: int | None = 3,
) -> InvestorResponse:
    """Map a User row + pre-aggregated activity into an InvestorResponse.

    holdings_cap=3 trims for the list view; pass None to keep all (detail view
    uses the InvestorDetailResponse subclass which exposes `holdings` instead
    of `top_holdings`).
    """
    primary_addr = None
    if u.wallets:
        addr = u.wallets[0].address
        primary_addr = (addr[:6] + "…" + addr[-4:]) if addr and len(addr) > 10 else addr

    top = holdings if holdings_cap is None else holdings[:holdings_cap]

    bo: list[BeneficialOwnerResponse] | None = None
    if u.verified_beneficial_owners:
        bo = [
            BeneficialOwnerResponse(
                name=b.get("name", "Unknown"),
                ownership_pct=str(b["ownership_pct"]) if b.get("ownership_pct") is not None else None,
            )
            for b in u.verified_beneficial_owners
            if isinstance(b, dict)
        ] or None

    # Recompute onboarding_completed based on identity mode.
    # In "simple" mode onchain_id is not required; the gate is:
    #   email verified + KYC approved + at least one wallet linked that is
    #   registered on-chain.
    # In "erc3643" mode the stored boolean (which requires onchain_id) is used
    # directly so we don't alter the existing gate logic.
    from apps.api.models.enums import KYCStatus

    kyc_status_val = u.kyc_status.value if hasattr(u.kyc_status, "value") else str(u.kyc_status)
    if settings.identity_mode == "simple":
        has_registered_wallet = any(
            getattr(w, "registered_on_chain", False) for w in (u.wallets or [])
        )
        computed_onboarding = bool(
            u.email_verified
            and kyc_status_val == KYCStatus.APPROVED.value
            and bool(u.wallets)
            and has_registered_wallet
        )
    else:
        computed_onboarding = u.onboarding_completed

    return InvestorResponse(
        id=str(u.id),
        email=u.email,
        display_name=u.display_name,
        investor_type=u.investor_type,
        kyc_status=kyc_status_val,
        kyc_level=u.kyc_level,
        onchain_id=u.onchain_id,
        wallet_address=primary_addr,
        wallet_count=len(u.wallets) if u.wallets else 0,
        onboarding_completed=computed_onboarding,
        email_verified=u.email_verified,
        created_at=u.created_at,

        # Self-reported
        date_of_birth=str(u.date_of_birth) if u.date_of_birth else None,
        nationality=u.nationality,
        country_of_residence=u.country_of_residence,
        phone_number=u.phone_number,
        company_name=u.company_name,
        company_registration_number=u.company_registration_number,
        company_jurisdiction=u.company_jurisdiction,

        # Sumsub-verified
        verified_full_name=u.verified_full_name,
        verified_date_of_birth=str(u.verified_date_of_birth) if u.verified_date_of_birth else None,
        verified_nationality=u.verified_nationality,
        verified_country_of_residence=u.verified_country_of_residence,
        verified_phone_number=u.verified_phone_number,
        verified_company_name=u.verified_company_name,
        verified_company_registration_number=u.verified_company_registration_number,
        verified_company_jurisdiction=u.verified_company_jurisdiction,
        verified_beneficial_owners=bo,
        kyc_synced_at=u.kyc_synced_at,

        # Activity
        participation_count=len(holdings),
        total_contributed_usdc=contributed_total,
        top_holdings=top,
    )


async def _aggregate_holdings(
    db: AsyncSession, user_ids: list[UUID]
) -> tuple[dict[UUID, list[HoldingResponse]], dict[UUID, str]]:
    """Single grouped query: per (user, sale) totals + claim-status rollup.

    Returns (holdings_by_user_id, contributed_total_by_user_id).
    Rolling claim_status across multiple phase-level contributions:
      - any REFUNDED → "refunded"
      - else all CLAIMED → "claimed"
      - else → "pending"
    """
    if not user_ids:
        return {}, {}

    from apps.api.models.contribution import Contribution
    from apps.api.models.enums import ContributionStatus
    from apps.api.models.token import Token
    from apps.api.models.token_sale import TokenSale

    rows = (
        await db.execute(
            select(
                Contribution.user_id,
                Contribution.sale_id,
                TokenSale.title.label("sale_title"),
                Token.symbol.label("token_symbol"),
                Contribution.payment_amount,
                Contribution.tokens_allocated,
                Contribution.status,
            )
            .join(TokenSale, TokenSale.id == Contribution.sale_id)
            .outerjoin(Token, Token.id == TokenSale.token_id)
            .where(Contribution.user_id.in_(user_ids))
        )
    ).all()

    # Bucket by (user_id, sale_id)
    from collections import defaultdict
    from decimal import Decimal

    bucket: dict[tuple[UUID, UUID], dict] = defaultdict(
        lambda: {
            "tokens_held": Decimal("0"),
            "contributed": Decimal("0"),
            "any_refunded": False,
            "all_claimed": True,
            "sale_title": "",
            "token_symbol": None,
        }
    )
    contributed_total: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0"))

    for r in rows:
        key = (r.user_id, r.sale_id)
        b = bucket[key]
        b["tokens_held"] += r.tokens_allocated or Decimal("0")
        b["contributed"] += r.payment_amount or Decimal("0")
        b["sale_title"] = r.sale_title or "(unnamed)"
        b["token_symbol"] = r.token_symbol
        if r.status == ContributionStatus.REFUNDED:
            b["any_refunded"] = True
        if r.status != ContributionStatus.CLAIMED:
            b["all_claimed"] = False
        contributed_total[r.user_id] += r.payment_amount or Decimal("0")

    holdings_by_user: dict[UUID, list[HoldingResponse]] = defaultdict(list)
    for (user_id, sale_id), b in bucket.items():
        if b["any_refunded"]:
            claim_status = "refunded"
        elif b["all_claimed"]:
            claim_status = "claimed"
        else:
            claim_status = "pending"
        holdings_by_user[user_id].append(
            HoldingResponse(
                sale_id=str(sale_id),
                sale_name=b["sale_title"],
                token_symbol=b["token_symbol"],
                tokens_held=str(b["tokens_held"]),
                contributed_usdc=str(b["contributed"]),
                claim_status=claim_status,
            )
        )

    # Sort each user's holdings by contributed DESC so [:3] shows the heaviest
    for hl in holdings_by_user.values():
        hl.sort(key=lambda h: Decimal(h.contributed_usdc), reverse=True)

    contributed_str = {uid: str(v) for uid, v in contributed_total.items()}
    return holdings_by_user, contributed_str


@router.get("/investors", response_model=InvestorListResponse)
async def list_investors(
    _user_id: RequireIssuerOrAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    kyc_status: str | None = Query(None),
    search: str | None = Query(None),
) -> InvestorListResponse:
    """List all investor accounts with KYC + activity aggregates."""
    from sqlalchemy import or_
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import UserRole
    from apps.api.models.wallet import Wallet

    offset = (page - 1) * size

    # Base query — outer-join wallets so we can search by address_checksum
    # without losing users who have no wallets.
    q = (
        select(User)
        .join(Wallet, Wallet.user_id == User.id, isouter=True)
        .where(User.role == UserRole.INVESTOR)
        .options(selectinload(User.wallets))
        .distinct()
        .order_by(User.created_at.desc())
    )
    if kyc_status:
        q = q.where(User.kyc_status == kyc_status)
    if search:
        pattern = f"%{search}%"
        q = q.where(
            or_(
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
                Wallet.address_checksum.ilike(pattern),
            )
        )

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).scalars().all()

    holdings_by_user, contributed_by_user = await _aggregate_holdings(
        db, [u.id for u in rows]
    )

    items = [
        _build_investor_response(
            u,
            holdings=holdings_by_user.get(u.id, []),
            contributed_total=contributed_by_user.get(u.id, "0"),
            holdings_cap=3,
        )
        for u in rows
    ]
    return InvestorListResponse(items=items, total=total, page=page, size=size)


@router.get("/investors/{user_id}", response_model=InvestorDetailResponse)
async def get_investor_detail(
    user_id: UUID,
    _admin_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> InvestorDetailResponse:
    """Get detailed investor profile."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.wallets))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
        )

    wallet_list = []
    if user.wallets:
        for w in user.wallets:
            wallet_list.append({
                "id": str(w.id),
                "address": w.address,
                "is_primary": getattr(w, "is_primary", False),
                "created_at": w.created_at.isoformat() if w.created_at else None,
            })

    # Aggregate holdings + total contributed for this single user
    holdings_by_user, contributed_by_user = await _aggregate_holdings(db, [user.id])
    user_holdings = holdings_by_user.get(user.id, [])
    user_contributed = contributed_by_user.get(user.id, "0")

    base = _build_investor_response(
        user,
        holdings=user_holdings,
        contributed_total=user_contributed,
        holdings_cap=None,  # detail view shows everything
    )

    return InvestorDetailResponse(
        **base.model_dump(),
        kyc_provider=user.kyc_provider,
        kyc_verified_at=user.kyc_verified_at,
        is_accredited=user.is_accredited,
        wallets=wallet_list,
        holdings=user_holdings,
        identity_mode=settings.identity_mode,
    )


# ==================== Admin KYC Management ====================


class AdminKYCUpdateRequest(BaseModel):
    """Admin request to update a user's KYC status."""

    kyc_status: str  # "approved", "rejected", "none"
    reason: str | None = None


class AdminKYCSyncResponse(BaseModel):
    """Response from Sumsub status check."""

    sumsub_status: str | None = None
    review_answer: str | None = None
    db_status: str
    db_level: int
    out_of_sync: bool = False
    suggested_action: str | None = None
    message: str = ""


@router.patch("/investors/{user_id}/kyc")
async def admin_update_kyc(
    user_id: UUID,
    request: AdminKYCUpdateRequest,
    admin_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Manually update a user's KYC status and trigger on-chain registration if approved.

    Admin-only. Supports approve, reject, or reset to none.
    """
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import KYCStatus

    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.wallets))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    new_status = request.kyc_status.lower()
    if new_status not in ("approved", "rejected", "none"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": "Status must be approved, rejected, or none"})

    old_status = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status)

    if new_status == "approved":
        user.kyc_status = KYCStatus.APPROVED
        user.kyc_level = 2
        user.kyc_provider = "admin-override"
        user.kyc_verified_at = datetime.now(tz=__import__("datetime").timezone.utc)

        # Trigger on-chain identity registration
        onchain_result = None
        try:
            from apps.api.services.kyc_service import KYCService
            kyc_svc = KYCService(db)
            await kyc_svc._issue_onchain_claims(user)
            onchain_result = "registered"
        except Exception as exc:
            onchain_result = f"failed: {exc}"

        await db.commit()

        # Audit log
        try:
            from apps.api.models.audit_log import AuditLog
            log_entry = AuditLog()
            log_entry.user_id = admin_id
            log_entry.action = "admin_kyc_approve"
            log_entry.target_type = "user"
            log_entry.target_id = str(user_id)
            log_entry.payload = {"old_status": old_status, "reason": request.reason, "onchain": onchain_result}
            db.add(log_entry)
            await db.commit()
        except Exception:
            pass

        # Notify user
        notification_sent = False
        try:
            from apps.api.services.notification_service import NotificationService
            ns = NotificationService(db)
            await ns.notify_kyc_approved(user.id, user.email)
            notification_sent = True
        except Exception:
            pass

        return {
            "user_id": str(user_id),
            "kyc_status": "approved",
            "kyc_level": 2,
            "onchain_registration": onchain_result,
            "notification_sent": notification_sent,
            "message": "KYC approved, on-chain identity registered, user notified",
        }

    elif new_status == "rejected":
        user.kyc_status = KYCStatus.REJECTED
        user.kyc_level = 0
        await db.commit()

        # Notify user
        notification_sent = False
        try:
            from apps.api.services.notification_service import NotificationService
            ns = NotificationService(db)
            await ns.notify_kyc_rejected(user.id, user.email)
            notification_sent = True
        except Exception:
            pass

        return {"user_id": str(user_id), "kyc_status": "rejected", "kyc_level": 0, "notification_sent": notification_sent, "message": "KYC rejected, user notified"}

    else:  # none — reset
        user.kyc_status = KYCStatus.NONE
        user.kyc_level = 0
        user.kyc_provider = None
        user.kyc_verified_at = None
        await db.commit()
        return {"user_id": str(user_id), "kyc_status": "none", "kyc_level": 0, "message": "KYC reset"}


@router.post("/investors/{user_id}/kyc/check-sumsub", response_model=AdminKYCSyncResponse)
async def admin_check_sumsub_status(
    user_id: UUID,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminKYCSyncResponse:
    """Check the latest KYC status from Sumsub API (read-only).

    Does NOT update the database. Returns whether the DB is out of sync
    with Sumsub and what action the admin should take.
    """
    from packages.common.core.config import get_settings

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    db_status = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status)

    applicant_id = user.sumsub_applicant_id
    if not applicant_id:
        return AdminKYCSyncResponse(
            db_status=db_status, db_level=user.kyc_level,
            message="No Sumsub applicant ID — user has not started KYC via Sumsub",
        )

    settings = get_settings()
    token = getattr(settings, "sumsub_app_token", None) or ""
    secret = getattr(settings, "sumsub_secret_key", None) or ""
    if not token or token.lower() in ("placeholder", "test", ""):
        return AdminKYCSyncResponse(
            db_status=db_status, db_level=user.kyc_level,
            message="Sumsub credentials not configured",
        )

    try:
        from apps.api.services.kyc_service import _sumsub_request
        applicant_data = await _sumsub_request("GET", f"/resources/applicants/{applicant_id}/one", token, secret)
    except Exception as exc:
        return AdminKYCSyncResponse(
            db_status=db_status, db_level=user.kyc_level,
            message=f"Failed to fetch from Sumsub: {exc}",
        )

    review = applicant_data.get("review", {})
    review_status = review.get("reviewStatus", "init")
    review_answer = review.get("reviewResult", {}).get("reviewAnswer")
    sumsub_status = f"{review_status}" + (f" ({review_answer})" if review_answer else "")

    # Determine sync status
    out_of_sync = False
    suggested_action = None

    if review_answer == "GREEN" and db_status != "approved":
        out_of_sync = True
        suggested_action = "approve"
        message = f"OUT OF SYNC: Sumsub approved (GREEN) but database shows '{db_status}'. Click 'Sync & Approve' to update."
    elif review_answer == "RED" and db_status != "rejected":
        out_of_sync = True
        suggested_action = "reject"
        message = f"OUT OF SYNC: Sumsub rejected (RED) but database shows '{db_status}'. Click 'Sync & Reject' to update."
    elif review_answer == "GREEN" and db_status == "approved":
        message = "In sync — Sumsub and database both show approved."
    elif review_answer == "RED" and db_status == "rejected":
        message = "In sync — Sumsub and database both show rejected."
    else:
        message = f"Sumsub: {sumsub_status} | Database: {db_status}"

    return AdminKYCSyncResponse(
        sumsub_status=sumsub_status,
        review_answer=review_answer,
        db_status=db_status,
        db_level=user.kyc_level,
        out_of_sync=out_of_sync,
        suggested_action=suggested_action,
        message=message,
    )


@router.post("/investors/{user_id}/kyc/confirm-sync")
async def admin_confirm_sync(
    user_id: UUID,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply the Sumsub status to the database, register on-chain, and notify the user.

    Call this after check-sumsub confirms out-of-sync status.
    """
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import KYCStatus
    from packages.common.core.config import get_settings

    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.wallets))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    applicant_id = user.sumsub_applicant_id
    if not applicant_id:
        raise HTTPException(status_code=400, detail={"code": "NO_SUMSUB_ID", "message": "User has no Sumsub applicant ID"})

    settings = get_settings()
    token = getattr(settings, "sumsub_app_token", None) or ""
    secret = getattr(settings, "sumsub_secret_key", None) or ""

    # Fetch fresh from Sumsub
    try:
        from apps.api.services.kyc_service import _sumsub_request
        applicant_data = await _sumsub_request("GET", f"/resources/applicants/{applicant_id}/one", token, secret)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"code": "SUMSUB_ERROR", "message": f"Failed to fetch from Sumsub: {exc}"}) from exc

    review_answer = applicant_data.get("review", {}).get("reviewResult", {}).get("reviewAnswer")
    old_status = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status)
    notification_sent = False

    if review_answer == "GREEN":
        user.kyc_status = KYCStatus.APPROVED
        user.kyc_level = 2
        user.kyc_provider = "sumsub"
        user.kyc_verified_at = datetime.now(tz=__import__("datetime").timezone.utc)

        # Mirror Sumsub-verified personal/corporate fields onto users.verified_*
        # so the admin UI can compare against self-reported.
        try:
            from apps.api.services.kyc_service import _persist_verified_kyc_info
            _persist_verified_kyc_info(user, applicant_data)
        except Exception as exc:
            log.warning("verified_* sync failed for user %s: %s", user.id, exc)

        # On-chain registration
        onchain_result = None
        try:
            from apps.api.services.kyc_service import KYCService
            kyc_svc = KYCService(db)
            await kyc_svc._issue_onchain_claims(user)
            onchain_result = "registered"
        except Exception as exc:
            onchain_result = f"failed: {exc}"

        await db.commit()

        # Notify user
        try:
            from apps.api.services.notification_service import NotificationService
            ns = NotificationService(db)
            await ns.notify_kyc_approved(user.id, user.email)
            notification_sent = True
        except Exception:
            pass

        return {
            "user_id": str(user_id),
            "old_status": old_status,
            "new_status": "approved",
            "kyc_level": 2,
            "onchain_registration": onchain_result,
            "notification_sent": notification_sent,
            "message": "Synced from Sumsub: KYC approved, on-chain registered, user notified",
        }

    elif review_answer == "RED":
        user.kyc_status = KYCStatus.REJECTED
        user.kyc_level = 0
        await db.commit()

        # Notify user
        try:
            from apps.api.services.notification_service import NotificationService
            ns = NotificationService(db)
            await ns.notify_kyc_rejected(user.id, user.email)
            notification_sent = True
        except Exception:
            pass

        return {
            "user_id": str(user_id),
            "old_status": old_status,
            "new_status": "rejected",
            "kyc_level": 0,
            "notification_sent": notification_sent,
            "message": "Synced from Sumsub: KYC rejected, user notified",
        }

    else:
        return {
            "user_id": str(user_id),
            "old_status": old_status,
            "new_status": old_status,
            "message": f"Sumsub review answer is '{review_answer}' — no change applied",
        }


@router.post("/investors/{user_id}/kyc/register-onchain")
async def admin_register_onchain(
    user_id: UUID,
    admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Manually trigger on-chain identity registration for a KYC-approved user.

    Use when on-chain registration failed or was skipped.
    """
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import KYCStatus

    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.wallets))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    if user.kyc_status != KYCStatus.APPROVED:
        raise HTTPException(status_code=400, detail={"code": "NOT_APPROVED", "message": "User must be KYC-approved before on-chain registration"})

    if not user.wallets:
        raise HTTPException(status_code=400, detail={"code": "NO_WALLETS", "message": "User has no connected wallets"})

    try:
        from apps.api.services.kyc_service import KYCService
        kyc_svc = KYCService(db)
        await kyc_svc._issue_onchain_claims(user)
        await db.commit()
        return {"user_id": str(user_id), "status": "registered", "message": "On-chain identity registered successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"code": "REGISTRATION_FAILED", "message": f"On-chain registration failed: {exc}"}) from exc


# ==================== Admin Account Management ====================


class AdminAccountResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    is_super_admin: bool
    created_at: datetime


class AdminListResponse(BaseModel):
    items: list[AdminAccountResponse]
    total: int


class CreateAdminRequest(BaseModel):
    email: str
    display_name: str | None = None


@router.get("/admins", response_model=AdminListResponse)
async def list_admins(
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminListResponse:
    """List all admin accounts."""
    # Only super admins can see admin list
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can manage admin accounts"})

    result = await db.execute(select(User).where(User.role == UserRole.ADMIN).order_by(User.created_at))
    admins = list(result.scalars().all())
    return AdminListResponse(
        items=[AdminAccountResponse(
            id=str(a.id), email=a.email, display_name=a.display_name,
            role="admin", is_super_admin=a.is_super_admin, created_at=a.created_at,
        ) for a in admins],
        total=len(admins),
    )


@router.post("/admins", response_model=AdminAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_admin(
    request: CreateAdminRequest,
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminAccountResponse:
    """Create a new admin account. Super admin only.

    Creates a passwordless admin — they log in via OTP.
    """
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can create admin accounts"})

    # Check email not taken
    existing = await db.execute(select(User).where(User.email == request.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "EMAIL_EXISTS", "message": "Email already registered"})

    user = User()
    user.email = request.email.lower()
    user.display_name = request.display_name or request.email.split("@")[0]
    user.role = UserRole.ADMIN
    user.email_verified = True
    from datetime import UTC
    from datetime import datetime as dt
    user.email_verified_at = dt.now(UTC)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return AdminAccountResponse(
        id=str(user.id), email=user.email, display_name=user.display_name,
        role="admin", is_super_admin=False, created_at=user.created_at,
    )


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_admin(
    admin_id: UUID,
    user_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove admin role (demote to investor). Super admin only. Cannot remove self or other super admins."""
    caller = await db.execute(select(User).where(User.id == user_id))
    caller_user = caller.scalar_one_or_none()
    if not caller_user or not caller_user.is_super_admin:
        raise HTTPException(status_code=403, detail={"code": "SUPER_ADMIN_REQUIRED", "message": "Only super admins can remove admins"})

    if admin_id == user_id:
        raise HTTPException(status_code=400, detail={"code": "CANNOT_REMOVE_SELF", "message": "Cannot remove yourself"})

    target = await db.execute(select(User).where(User.id == admin_id))
    target_user = target.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    if target_user.is_super_admin:
        raise HTTPException(status_code=400, detail={"code": "CANNOT_REMOVE_SUPER", "message": "Cannot remove a super admin"})

    target_user.role = UserRole.INVESTOR
    await db.commit()
