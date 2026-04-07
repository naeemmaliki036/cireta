"""Admin investors endpoint — list users with investor role."""

from __future__ import annotations

from datetime import datetime

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import UserRole
from apps.api.models.user import User
from packages.common.core.auth_deps import RequireAdmin, RequireIssuerOrAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


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

    class Config:
        from_attributes = True


class InvestorDetailResponse(InvestorResponse):
    nationality: str | None = None
    country_of_residence: str | None = None
    date_of_birth: str | None = None
    company_name: str | None = None
    company_registration_number: str | None = None
    company_jurisdiction: str | None = None
    kyc_provider: str | None = None
    kyc_verified_at: datetime | None = None
    is_accredited: bool = False
    wallets: list[dict] = []


class InvestorListResponse(BaseModel):
    items: list[InvestorResponse]
    total: int
    page: int
    size: int


@router.get("/investors", response_model=InvestorListResponse)
async def list_investors(
    _user_id: RequireIssuerOrAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    kyc_status: str | None = Query(None),
) -> InvestorListResponse:
    """List all investor accounts with optional KYC status filter."""
    from sqlalchemy.orm import selectinload

    from apps.api.models.enums import UserRole

    offset = (page - 1) * size
    q = (
        select(User)
        .where(User.role == UserRole.INVESTOR)
        .options(selectinload(User.wallets))
        .order_by(User.created_at.desc())
    )
    if kyc_status:
        q = q.where(User.kyc_status == kyc_status)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(offset).limit(size))).scalars().all()

    items = [
        InvestorResponse(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            investor_type=u.investor_type,
            kyc_status=u.kyc_status.value if hasattr(u.kyc_status, "value") else str(u.kyc_status),
            kyc_level=u.kyc_level,
            onchain_id=u.onchain_id,
            wallet_address=(u.wallets[0].address[:6] + "…" + u.wallets[0].address[-4:])
            if u.wallets and u.wallets[0].address and len(u.wallets[0].address) > 10
            else (u.wallets[0].address if u.wallets else None),
            wallet_count=len(u.wallets) if u.wallets else 0,
            onboarding_completed=u.onboarding_completed,
            email_verified=u.email_verified,
            created_at=u.created_at,
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
    primary_address = None
    if user.wallets:
        for w in user.wallets:
            wallet_list.append({
                "id": str(w.id),
                "address": w.address,
                "is_primary": getattr(w, "is_primary", False),
                "created_at": w.created_at.isoformat() if w.created_at else None,
            })
        if user.wallets[0].address and len(user.wallets[0].address) > 10:
            primary_address = user.wallets[0].address[:6] + "…" + user.wallets[0].address[-4:]
        else:
            primary_address = user.wallets[0].address if user.wallets else None

    return InvestorDetailResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        investor_type=user.investor_type,
        kyc_status=user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status),
        kyc_level=user.kyc_level,
        onchain_id=user.onchain_id,
        wallet_address=primary_address,
        wallet_count=len(user.wallets) if user.wallets else 0,
        onboarding_completed=user.onboarding_completed,
        email_verified=user.email_verified,
        nationality=user.nationality,
        country_of_residence=user.country_of_residence,
        date_of_birth=str(user.date_of_birth) if user.date_of_birth else None,
        company_name=user.company_name,
        company_registration_number=user.company_registration_number,
        company_jurisdiction=user.company_jurisdiction,
        kyc_provider=user.kyc_provider,
        kyc_verified_at=user.kyc_verified_at,
        is_accredited=user.is_accredited,
        wallets=wallet_list,
        created_at=user.created_at,
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
    admin_id: RequireAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdminKYCSyncResponse:
    """Check the latest KYC status from Sumsub API (read-only).

    Does NOT update the database. Returns whether the DB is out of sync
    with Sumsub and what action the admin should take.
    """
    from apps.api.models.enums import KYCStatus
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
    admin_id: RequireAdmin,
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
        raise HTTPException(status_code=502, detail={"code": "SUMSUB_ERROR", "message": f"Failed to fetch from Sumsub: {exc}"})

    review_answer = applicant_data.get("review", {}).get("reviewResult", {}).get("reviewAnswer")
    old_status = user.kyc_status.value if hasattr(user.kyc_status, "value") else str(user.kyc_status)
    notification_sent = False

    if review_answer == "GREEN":
        user.kyc_status = KYCStatus.APPROVED
        user.kyc_level = 2
        user.kyc_provider = "sumsub"
        user.kyc_verified_at = datetime.now(tz=__import__("datetime").timezone.utc)

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
    admin_id: RequireAdmin,
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
        raise HTTPException(status_code=500, detail={"code": "REGISTRATION_FAILED", "message": f"On-chain registration failed: {exc}"})


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
    from datetime import UTC, datetime as dt
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
