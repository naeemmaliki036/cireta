"""KYC service for Sumsub integration.

CRITICAL: Webhook HMAC validation must happen BEFORE any processing.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
from apps.api.models.enums import KYCStatus
from apps.api.models.kyc_application import KYCApplication
from apps.api.models.user import User
from apps.api.services.notification_service import NotificationService


class KYCService:
    """Service for KYC operations with Sumsub integration.

    CRITICAL: All webhook processing must validate HMAC signature first.
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialize KYC service."""
        self.db = db

    async def initiate(self, user_id: UUID) -> dict[str, Any]:
        """Initiate KYC process for a user.

        Creates a Sumsub applicant and returns access token for WebSDK.

        Args:
            user_id: User UUID.

        Returns:
            Dict with applicant_id, access_token, and expiration.

        Raises:
            HTTPException: If user not eligible or already verified.
        """
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        # Check if already approved
        if user.kyc_status == KYCStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_VERIFIED", "message": "KYC already approved"},
            )

        # Check if application pending
        if user.kyc_status == KYCStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "APPLICATION_PENDING",
                    "message": "KYC application already pending",
                },
            )

        # TODO: Call Sumsub API to create applicant and get access token
        # For now, create a placeholder application
        applicant_id = f"sumsub-{user_id}"

        # Create KYC application record
        application = KYCApplication()
        application.user_id = user_id
        application.sumsub_review_id = applicant_id
        application.status = "pending"
        application.submitted_at = datetime.now(UTC)

        self.db.add(application)

        # Update user status
        user.kyc_status = KYCStatus.PENDING
        user.sumsub_applicant_id = applicant_id

        await self.db.commit()

        # TODO: Get actual access token from Sumsub
        return {
            "applicant_id": applicant_id,
            "access_token": f"placeholder-token-{user_id}",
            "expiration": datetime.now(UTC),
        }

    async def get_status(self, user_id: UUID) -> dict[str, Any]:
        """Get KYC status for a user.

        Args:
            user_id: User UUID.

        Returns:
            Dict with status, level, and application details.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        # Get latest application
        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user_id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()

        return {
            "status": user.kyc_status.value if hasattr(user.kyc_status, "value") else user.kyc_status,
            "level": user.kyc_level,
            "review_status": application.status if application else None,
            "submitted_at": application.submitted_at if application else None,
            "reviewed_at": application.reviewed_at if application else None,
        }

    async def handle_webhook(
        self, payload: dict[str, Any], ip_address: str | None = None
    ) -> None:
        """Handle Sumsub webhook after HMAC validation.

        CRITICAL: HMAC validation must happen in the endpoint BEFORE calling this.

        Args:
            payload: Verified webhook payload.
            ip_address: Request IP for audit logging.
        """
        applicant_id = payload.get("applicantId")
        external_user_id = payload.get("externalUserId")
        event_type = payload.get("type")
        review_status = payload.get("reviewStatus")
        review_result = payload.get("reviewResult", {})

        if not applicant_id:
            return

        # Find user by applicant ID
        result = await self.db.execute(
            select(User).where(User.sumsub_applicant_id == applicant_id)
        )
        user = result.scalar_one_or_none()

        if not user and external_user_id:
            # Try by external user ID (which should be our user UUID)
            try:
                user_uuid = UUID(external_user_id)
                result = await self.db.execute(
                    select(User).where(User.id == user_uuid)
                )
                user = result.scalar_one_or_none()
            except ValueError:
                pass

        if not user:
            # User not found, log and ignore
            return

        # Update application
        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user.id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()

        if application:
            application.status = review_status or event_type
            application.result_payload = payload

            if review_status == "completed":
                application.reviewed_at = datetime.now(UTC)

        # Update user KYC status based on review result
        if event_type == "applicantReviewed" and review_result:
            review_answer = review_result.get("reviewAnswer")

            if review_answer == "GREEN":
                user.kyc_status = KYCStatus.APPROVED
                user.kyc_level = 2  # Basic KYC level
                user.kyc_provider = "sumsub"
                user.kyc_external_id = applicant_id
                user.kyc_verified_at = datetime.now(UTC)
                await self._issue_onchain_claims(user)
                # Send notification + email
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_approved(user.id, user.email, 2)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("KYC notification failed: %s", e)
                # Queue ONCHAINID deployment for primary wallet
                try:
                    from packages.common.core.config import settings
                    if settings.redis_url:
                        from arq import create_pool
                        from arq.connections import RedisSettings
                        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
                        primary_wallet = next((w for w in user.wallets if w.is_primary), None)
                        if primary_wallet:
                            await pool.enqueue_job(
                                "task_deploy_onchainid",
                                str(user.id),
                                primary_wallet.address_checksum,
                            )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("ONCHAINID queue failed: %s", e)
            elif review_answer == "RED":
                user.kyc_status = KYCStatus.REJECTED
                user.kyc_level = 0
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_rejected(user.id, user.email)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning("KYC rejection notification failed: %s", e)

        # Write audit log
        await self._write_audit(
            actor_id=None,  # System action
            action=f"kyc_webhook_{event_type}",
            target_type="user",
            target_id=str(user.id),
            payload={
                "applicant_id": applicant_id,
                "event_type": event_type,
                "review_status": review_status,
                "review_answer": review_result.get("reviewAnswer") if review_result else None,
            },
            ip_address=ip_address,
        )

        await self.db.commit()

    async def _issue_onchain_claims(self, user: User) -> None:
        """Issue ONCHAINID claims for verified user.

        TODO: Implement actual on-chain claim issuance via Web3Service.
        """
        # Placeholder for on-chain claim issuance
        pass

    async def _write_audit(
        self,
        actor_id: UUID | None,
        action: str,
        target_type: str,
        target_id: str,
        payload: dict[str, Any] | None = None,
        ip_address: str | None = None,
        reason: str | None = None,
    ) -> AuditLog:
        """Write an audit log entry.

        CRITICAL: Audit logs are append-only for compliance.

        Args:
            actor_id: User who performed the action (None for system).
            action: Action type.
            target_type: Type of target entity.
            target_id: ID of target entity.
            payload: Additional action details.
            ip_address: IP address of actor.
            reason: Reason for action.

        Returns:
            Created audit log entry.
        """
        audit = AuditLog()
        audit.actor_id = actor_id
        audit.action = action
        audit.target_type = target_type
        audit.target_id = target_id
        audit.payload = payload
        audit.ip_address = ip_address
        audit.reason = reason

        self.db.add(audit)
        await self.db.flush()

        return audit
