"""Issuer service for managing token issuers."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import (
    IdentityVerificationStatus,
    IssuerStatus,
    IssuerType,
    UserRole,
    WalletApprovalStatus,
)
from apps.api.models.issuer import Issuer
from apps.api.models.issuer_whitelist import IssuerWhitelist
from apps.api.models.user import User


class IssuerService:
    """Service for issuer management."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Whitelist ──

    async def add_to_whitelist(
        self, email: str, issuer_type: str, invited_by: UUID, kyc_required: bool = True
    ) -> IssuerWhitelist:
        """Add an email to the issuer whitelist."""
        existing = await self.db.execute(
            select(IssuerWhitelist).where(IssuerWhitelist.email == email.lower())
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_WHITELISTED", "message": "Email already whitelisted"},
            )
        entry = IssuerWhitelist()
        entry.email = email.lower()
        entry.issuer_type = IssuerType(issuer_type)
        entry.invited_by = invited_by
        entry.kyc_required = kyc_required
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def list_whitelist(self) -> list[IssuerWhitelist]:
        """List all whitelisted emails."""
        result = await self.db.execute(
            select(IssuerWhitelist).order_by(IssuerWhitelist.created_at.desc())
        )
        return list(result.scalars().all())

    async def remove_from_whitelist(self, entry_id: UUID) -> None:
        """Remove an email from the whitelist."""
        result = await self.db.execute(
            select(IssuerWhitelist).where(IssuerWhitelist.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOT_FOUND", "message": "Whitelist entry not found"},
            )
        if entry.registered_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "ALREADY_REGISTERED", "message": "Cannot remove — issuer already registered"},
            )
        await self.db.delete(entry)
        await self.db.commit()

    async def check_whitelist(self, email: str) -> IssuerWhitelist | None:
        """Check if an email is whitelisted. Returns entry or None."""
        result = await self.db.execute(
            select(IssuerWhitelist).where(
                IssuerWhitelist.email == email.lower(),
                IssuerWhitelist.registered_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    # ── Issuer Onboarding ──

    async def onboard_issuer(
        self,
        user_id: UUID,
        name: str,
        slug: str,
        issuer_type: IssuerType = IssuerType.INDIVIDUAL,
        legal_entity_name: str | None = None,
        jurisdiction: str | None = None,
        wallet_address: str | None = None,
    ) -> Issuer:
        """Onboard a new issuer."""
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        existing_result = await self.db.execute(select(Issuer).where(Issuer.user_id == user_id))
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_ISSUER", "message": "User is already an issuer"},
            )

        slug_result = await self.db.execute(select(Issuer).where(Issuer.slug == slug))
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "SLUG_EXISTS", "message": "Slug already in use"},
            )

        issuer = Issuer()
        issuer.user_id = user_id
        issuer.name = name
        issuer.slug = slug
        issuer.issuer_type = issuer_type
        issuer.legal_entity_name = legal_entity_name
        issuer.jurisdiction = jurisdiction
        issuer.wallet_address = wallet_address
        issuer.status = IssuerStatus.PENDING

        self.db.add(issuer)
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    # ── Wallet ──

    async def submit_wallet(self, user_id: UUID, wallet_address: str) -> Issuer:
        """Issuer connects and verifies wallet (signed, not yet submitted for approval)."""
        issuer = await self._get_issuer_by_user(user_id)
        issuer.wallet_address = wallet_address
        issuer.wallet_status = WalletApprovalStatus.VERIFIED
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def submit_wallet_for_approval(self, user_id: UUID) -> Issuer:
        """Issuer explicitly submits their verified wallet for admin approval."""
        issuer = await self._get_issuer_by_user(user_id)
        if not issuer.wallet_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NO_WALLET", "message": "No wallet connected. Connect a wallet first."},
            )
        if issuer.wallet_status == WalletApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "ALREADY_APPROVED", "message": "Wallet is already approved."},
            )
        issuer.wallet_status = WalletApprovalStatus.PENDING_APPROVAL
        await self.db.commit()
        await self.db.refresh(issuer)

        # Notify all admin users
        await self._notify_admins_issuer_submitted(issuer)

        return issuer

    async def _notify_admins_issuer_submitted(self, issuer: Issuer) -> None:
        """Create in-app + email notifications for admins when issuer submits for approval."""
        from apps.api.models.notification import Notification
        from apps.api.services.email_service import EmailService

        admin_results = await self.db.execute(
            select(User).where(User.role == UserRole.ADMIN)
        )
        admins = list(admin_results.scalars().all())

        for admin in admins:
            notif = Notification()
            notif.user_id = admin.id
            notif.type = "issuer_approval_request"
            notif.title = "Issuer submitted for approval"
            notif.message = (
                f"{issuer.name} has completed onboarding and submitted their profile for approval. "
                f"Review their wallet and identity verification to activate their account."
            )
            notif.data = {
                "issuer_id": str(issuer.id),
                "issuer_name": issuer.name,
                "action_url": f"/platform/issuers/{issuer.id}",
            }
            self.db.add(notif)

        await self.db.commit()

        # Send email (non-blocking, best-effort)
        try:
            email_svc = EmailService(self.db)
            for admin in admins:
                await email_svc.send(
                    "issuer_approval_request",
                    admin.email,
                    {
                        "issuer_name": issuer.name,
                        "action_url": f"/platform/issuers/{issuer.id}",
                    },
                )
        except Exception:
            pass  # Non-fatal — in-app notification is the primary channel

    async def discard_wallet(self, user_id: UUID) -> Issuer:
        """Issuer discards their wallet before submission/approval."""
        issuer = await self._get_issuer_by_user(user_id)
        if issuer.wallet_status == WalletApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "ALREADY_APPROVED", "message": "Cannot discard an approved wallet. Contact admin."},
            )
        if issuer.wallet_status == WalletApprovalStatus.PENDING_APPROVAL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "PENDING_APPROVAL", "message": "Cannot discard while pending approval. Contact admin."},
            )
        issuer.wallet_address = None
        issuer.wallet_status = WalletApprovalStatus.NONE
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def approve_wallet(self, issuer_id: UUID) -> Issuer:
        """Admin approves issuer wallet."""
        issuer = await self._get_issuer(issuer_id)
        if not issuer.wallet_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NO_WALLET", "message": "Issuer has not submitted a wallet"},
            )
        issuer.wallet_status = WalletApprovalStatus.APPROVED
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def reject_wallet(self, issuer_id: UUID) -> Issuer:
        """Admin rejects issuer wallet."""
        issuer = await self._get_issuer(issuer_id)
        issuer.wallet_status = WalletApprovalStatus.REJECTED
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    # ── Identity (KYC/KYB) ──

    async def set_identity_pending(self, user_id: UUID, applicant_id: str) -> Issuer:
        """Mark issuer identity verification as pending."""
        issuer = await self._get_issuer_by_user(user_id)
        issuer.identity_status = IdentityVerificationStatus.PENDING
        issuer.sumsub_applicant_id = applicant_id
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def set_identity_approved(self, issuer_id: UUID) -> Issuer:
        """Mark issuer identity as approved (called from webhook)."""
        issuer = await self._get_issuer(issuer_id)
        issuer.identity_status = IdentityVerificationStatus.APPROVED
        issuer.identity_verified_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def set_identity_rejected(self, issuer_id: UUID) -> Issuer:
        """Mark issuer identity as rejected."""
        issuer = await self._get_issuer(issuer_id)
        issuer.identity_status = IdentityVerificationStatus.REJECTED
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    # ── Activation ──

    async def activate_issuer(self, issuer_id: UUID) -> Issuer:
        """Activate a pending issuer. Requires wallet + identity approved."""
        issuer = await self._get_issuer(issuer_id)

        missing = []
        if issuer.wallet_status != WalletApprovalStatus.APPROVED:
            missing.append("wallet_approval")
        if issuer.identity_status != IdentityVerificationStatus.APPROVED:
            missing.append("identity_verification")

        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "ACTIVATION_GATES_NOT_MET",
                    "message": f"Cannot activate: missing {', '.join(missing)}",
                    "missing_gates": missing,
                },
            )

        issuer.status = IssuerStatus.ACTIVE

        # Sync User.role
        user_result = await self.db.execute(select(User).where(User.id == issuer.user_id))
        user = user_result.scalar_one()
        user.role = UserRole.ISSUER

        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    async def revoke_issuer(self, issuer_id: UUID) -> Issuer:
        """Revoke/suspend an issuer."""
        issuer = await self._get_issuer(issuer_id)
        issuer.status = IssuerStatus.SUSPENDED

        # Sync User.role back to INVESTOR
        user_result = await self.db.execute(select(User).where(User.id == issuer.user_id))
        user = user_result.scalar_one()
        user.role = UserRole.INVESTOR

        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    # ── Onboarding Status ──

    async def get_onboarding_status(self, user_id: UUID) -> dict:
        """Get full onboarding status for an issuer."""
        issuer = await self._get_issuer_by_user(user_id)

        # Look up whitelist entry to get kyc_required flag
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one()
        wl_result = await self.db.execute(
            select(IssuerWhitelist).where(IssuerWhitelist.email == user.email.lower())
        )
        wl_entry = wl_result.scalar_one_or_none()
        kyc_required = wl_entry.kyc_required if wl_entry else True

        missing = []
        if issuer.wallet_status != WalletApprovalStatus.APPROVED:
            missing.append("wallet_approval")
        if issuer.identity_status != IdentityVerificationStatus.APPROVED:
            missing.append("identity_verification")
        if issuer.status != IssuerStatus.ACTIVE:
            missing.append("issuer_activation")

        def _val(v: object) -> str:
            return v.value if hasattr(v, "value") else str(v)

        return {
            "issuer_status": _val(issuer.status),
            "issuer_type": _val(issuer.issuer_type),
            "wallet_connected": issuer.wallet_address is not None,
            "wallet_address": issuer.wallet_address,
            "wallet_status": _val(issuer.wallet_status),
            "identity_status": _val(issuer.identity_status),
            "kyc_required": kyc_required,
            "can_deploy": issuer.status == IssuerStatus.ACTIVE,
            "missing_gates": missing,
        }

    # ── Existing ──

    async def list_issuers(
        self, page: int = 1, size: int = 20, status_filter: IssuerStatus | None = None
    ) -> tuple[list[Issuer], int]:
        """List issuers with pagination."""
        query = (
            select(Issuer)
            .options(selectinload(Issuer.user), selectinload(Issuer.token_sales))
            .order_by(Issuer.created_at.desc())
        )
        if status_filter:
            query = query.where(Issuer.status == status_filter)

        count_query = select(func.count()).select_from(Issuer)
        if status_filter:
            count_query = count_query.where(Issuer.status == status_filter)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        issuers = list(result.scalars().all())
        return issuers, total

    async def set_fee(self, issuer_id: UUID, fee_bps: int) -> Issuer:
        """Update issuer fee."""
        issuer = await self._get_issuer(issuer_id)
        if not (0 <= fee_bps <= 10000):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_FEE", "message": "Fee must be between 0 and 10000 bps"},
            )
        issuer.fee_bps = fee_bps
        await self.db.commit()
        await self.db.refresh(issuer)
        return issuer

    # ── Helpers ──

    async def _get_issuer(self, issuer_id: UUID) -> Issuer:
        result = await self.db.execute(
            select(Issuer)
            .options(selectinload(Issuer.user), selectinload(Issuer.token_sales))
            .where(Issuer.id == issuer_id)
        )
        issuer = result.scalar_one_or_none()
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ISSUER_NOT_FOUND", "message": "Issuer not found"},
            )
        return issuer

    async def _get_issuer_by_user(self, user_id: UUID) -> Issuer:
        result = await self.db.execute(select(Issuer).where(Issuer.user_id == user_id))
        issuer = result.scalar_one_or_none()
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOT_AN_ISSUER", "message": "User is not an issuer"},
            )
        return issuer
