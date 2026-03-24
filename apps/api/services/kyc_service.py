"""KYC service for Sumsub integration.

CRITICAL: Webhook HMAC validation must happen BEFORE any processing.
"""

import hashlib
import hmac
import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
from apps.api.models.enums import KYCStatus
from apps.api.models.kyc_application import KYCApplication
from apps.api.models.user import User
from apps.api.services.notification_service import NotificationService

log = logging.getLogger(__name__)

SUMSUB_BASE = "https://api.sumsub.com"


def _sumsub_sign(secret: str, ts: int, method: str, path: str, body: bytes = b"") -> str:
    """Generate Sumsub HMAC-SHA256 signature."""
    msg = f"{ts}{method}{path}".encode() + body
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


async def _sumsub_request(
    method: str,
    path: str,
    app_token: str,
    secret_key: str,
    json: dict | None = None,
) -> dict:
    """Make authenticated Sumsub API request."""
    ts = int(time.time())
    body = b""
    if json:
        import json as _json

        body = _json.dumps(json).encode()
    sig = _sumsub_sign(secret_key, ts, method.upper(), path, body)
    headers = {
        "X-App-Token": app_token,
        "X-App-Access-Sig": sig,
        "X-App-Access-Ts": str(ts),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.request(
            method, f"{SUMSUB_BASE}{path}", headers=headers, content=body or None
        )
        resp.raise_for_status()
        return resp.json()


def _is_dev_mode(settings: Any) -> bool:
    """True if Sumsub credentials are placeholders."""
    token = getattr(settings, "sumsub_app_token", None) or ""
    return not token or token.lower() in ("placeholder", "test", "") or token.startswith("test-")


class KYCService:
    """Service for KYC operations with Sumsub integration."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def initiate(self, user_id: UUID) -> dict[str, Any]:
        """Initiate KYC process — creates Sumsub applicant and returns SDK token."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )
        if user.kyc_status == KYCStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_VERIFIED", "message": "KYC already approved"},
            )
        if user.kyc_status == KYCStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "APPLICATION_PENDING",
                    "message": "KYC application already pending",
                },
            )

        from packages.common.core.config import get_settings

        settings = get_settings()

        applicant_id = f"cireta-{user_id}"
        access_token = f"dev-token-{user_id}"

        if _is_dev_mode(settings):
            log.warning("Sumsub dev mode — returning mock token for user %s", user_id)
        else:
            try:
                # Create applicant
                applicant_resp = await _sumsub_request(
                    "POST",
                    "/resources/applicants?levelName=basic-kyc-level",
                    settings.sumsub_app_token,
                    settings.sumsub_secret_key,
                    json={"externalUserId": str(user_id), "email": user.email},
                )
                applicant_id = applicant_resp.get("id", applicant_id)

                # Get access token
                token_resp = await _sumsub_request(
                    "POST",
                    f"/resources/accessTokens?userId={applicant_id}&levelName=basic-kyc-level",
                    settings.sumsub_app_token,
                    settings.sumsub_secret_key,
                )
                access_token = token_resp.get("token", access_token)
            except Exception as exc:
                log.error("Sumsub API error: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"code": "KYC_PROVIDER_ERROR", "message": "KYC provider unavailable"},
                ) from exc

        # Persist application
        application = KYCApplication()
        application.user_id = user_id
        application.sumsub_review_id = applicant_id
        application.status = "pending"
        application.submitted_at = datetime.now(UTC)
        self.db.add(application)

        user.kyc_status = KYCStatus.PENDING
        user.sumsub_applicant_id = applicant_id
        await self.db.commit()

        return {
            "applicant_id": applicant_id,
            "access_token": access_token,
            "expiration": datetime.now(UTC),
        }

    async def get_status(self, user_id: UUID) -> dict[str, Any]:
        """Get KYC status for a user."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )
        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user_id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()
        return {
            "status": user.kyc_status.value
            if hasattr(user.kyc_status, "value")
            else user.kyc_status,
            "level": user.kyc_level,
            "review_status": application.status if application else None,
            "submitted_at": application.submitted_at if application else None,
            "reviewed_at": application.reviewed_at if application else None,
        }

    async def handle_webhook(self, payload: dict[str, Any], ip_address: str | None = None) -> None:
        """Handle Sumsub webhook (HMAC must be validated before calling this)."""
        applicant_id = payload.get("applicantId")
        external_user_id = payload.get("externalUserId")
        event_type = payload.get("type")
        review_status = payload.get("reviewStatus")
        review_result = payload.get("reviewResult", {})

        if not applicant_id:
            return

        result = await self.db.execute(select(User).where(User.sumsub_applicant_id == applicant_id))
        user = result.scalar_one_or_none()

        if not user and external_user_id:
            try:
                user_uuid = UUID(external_user_id)
                result = await self.db.execute(select(User).where(User.id == user_uuid))
                user = result.scalar_one_or_none()
            except ValueError:
                pass

        if not user:
            return

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

        if event_type == "applicantReviewed" and review_result:
            review_answer = review_result.get("reviewAnswer")
            if review_answer == "GREEN":
                user.kyc_status = KYCStatus.APPROVED
                user.kyc_level = 2
                user.kyc_provider = "sumsub"
                user.kyc_external_id = applicant_id
                user.kyc_verified_at = datetime.now(UTC)
                await self._issue_onchain_claims(user)
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_approved(user.id, user.email, 2)
                except Exception as e:
                    log.warning("KYC notification failed: %s", e)
                try:
                    from packages.common.core.config import get_settings

                    settings = get_settings()
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
                    log.warning("ONCHAINID queue failed: %s", e)
            elif review_answer == "RED":
                user.kyc_status = KYCStatus.REJECTED
                user.kyc_level = 0
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_rejected(user.id, user.email)
                except Exception as e:
                    log.warning("KYC rejection notification failed: %s", e)

        await self._write_audit(
            actor_id=None,
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
        """Deploy ONCHAINID + issue claims + register in IdentityRegistry.

        Full flow for a verified user:
        1. Deploy ONCHAINID via CREATE2 (idempotent)
        2. Issue KYC, country, investor type claims with real ECDSA signatures
        3. Register wallet → identity in IdentityRegistry
        4. Store identity address on user model

        Dev mode: logs and skips.
        """
        from packages.common.core.config import get_settings

        settings = get_settings()
        if _is_dev_mode(settings):
            log.info("Dev mode — skipping on-chain identity for user %s", user.id)
            return

        # Get user's primary wallet
        primary_wallet = next((w for w in user.wallets if w.is_primary), None)
        if not primary_wallet:
            log.warning("User %s has no primary wallet — cannot deploy ONCHAINID", user.id)
            return

        if not settings.identity_registry_address:
            log.warning("IDENTITY_REGISTRY_ADDRESS not configured — skipping")
            return

        try:
            from apps.api.services.web3_identity_service import Web3IdentityService

            identity_svc = Web3IdentityService()
            identity_address = await identity_svc.register_identity_full(
                wallet_address=primary_wallet.address,
                identity_registry=settings.identity_registry_address,
                country_code=user.country_code or "XX",
                kyc_level=user.kyc_level or 2,
                investor_type=user.investor_type or "individual",
            )

            # Store identity address on user model
            user.onchain_id = identity_address
            log.info(
                "Full ONCHAINID registration complete for user %s: %s",
                user.id,
                identity_address,
            )
        except Exception as exc:
            # Non-fatal: log error, admin can retry via compliance dashboard
            log.error("Failed ONCHAINID registration for user %s: %s", user.id, exc)

    async def initiate_corporate(self, user_id: UUID, body: Any) -> dict[str, Any]:
        """Initiate corporate KYB — creates Sumsub business-level applicant."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )
        if user.kyc_status == KYCStatus.APPROVED and user.kyc_level >= 4:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_VERIFIED", "message": "Corporate KYB already approved"},
            )

        from packages.common.core.config import get_settings

        settings = get_settings()

        applicant_id = f"cireta-corp-{user_id}"
        access_token = f"dev-corp-token-{user_id}"

        if _is_dev_mode(settings):
            log.warning("Sumsub dev mode — returning mock corporate token for user %s", user_id)
        else:
            try:
                applicant_resp = await _sumsub_request(
                    "POST",
                    "/resources/applicants?levelName=business-kyb-level",
                    settings.sumsub_app_token,
                    settings.sumsub_secret_key,
                    json={
                        "externalUserId": str(user_id),
                        "email": user.email,
                        "type": "company",
                        "info": {
                            "companyInfo": {
                                "companyName": body.company_name,
                                "registrationNumber": body.registration_number,
                                "country": body.jurisdiction,
                            }
                        },
                    },
                )
                applicant_id = applicant_resp.get("id", applicant_id)
                token_resp = await _sumsub_request(
                    "POST",
                    f"/resources/accessTokens?userId={applicant_id}&levelName=business-kyb-level",
                    settings.sumsub_app_token,
                    settings.sumsub_secret_key,
                )
                access_token = token_resp.get("token", access_token)
            except Exception as exc:
                log.error("Sumsub corporate API error: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={"code": "KYC_PROVIDER_ERROR", "message": "KYC provider unavailable"},
                ) from exc

        application = KYCApplication()
        application.user_id = user_id
        application.sumsub_review_id = applicant_id
        application.status = "pending"
        application.submitted_at = datetime.now(UTC)
        application.result_payload = {
            "type": "corporate",
            "company_name": body.company_name,
            "registration_number": body.registration_number,
            "jurisdiction": body.jurisdiction,
            "directors": body.directors,
            "ubo_list": body.ubo_list,
        }
        self.db.add(application)

        user.kyc_status = KYCStatus.PENDING
        user.sumsub_applicant_id = applicant_id
        user.investor_type = "corporate"
        await self.db.commit()

        return {
            "applicant_id": applicant_id,
            "access_token": access_token,
            "expiration": datetime.now(UTC),
        }

    async def get_corporate_status(self, user_id: UUID) -> dict[str, Any]:
        """Get corporate KYB status."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )
        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user_id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()
        company_name = None
        if application and application.result_payload:
            company_name = application.result_payload.get("company_name")
        return {
            "status": user.kyc_status.value
            if hasattr(user.kyc_status, "value")
            else user.kyc_status,
            "level": user.kyc_level,
            "company_name": company_name,
            "review_status": application.status if application else None,
            "submitted_at": application.submitted_at if application else None,
            "reviewed_at": application.reviewed_at if application else None,
        }

    async def handle_corporate_webhook(
        self, payload: dict[str, Any], ip_address: str | None = None
    ) -> None:
        """Handle Sumsub corporate KYB webhook — sets kyc_level=4 on GREEN."""
        applicant_id = payload.get("applicantId")
        external_user_id = payload.get("externalUserId")
        event_type = payload.get("type")
        review_result = payload.get("reviewResult", {})

        if not applicant_id:
            return

        result = await self.db.execute(select(User).where(User.sumsub_applicant_id == applicant_id))
        user = result.scalar_one_or_none()
        if not user and external_user_id:
            try:
                result = await self.db.execute(
                    select(User).where(User.id == UUID(external_user_id))
                )
                user = result.scalar_one_or_none()
            except ValueError:
                pass
        if not user:
            return

        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user.id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()
        if application:
            application.status = payload.get("reviewStatus") or event_type
            application.result_payload = {**(application.result_payload or {}), "webhook": payload}
            if payload.get("reviewStatus") == "completed":
                application.reviewed_at = datetime.now(UTC)

        if event_type == "applicantReviewed" and review_result:
            review_answer = review_result.get("reviewAnswer")
            if review_answer == "GREEN":
                user.kyc_status = KYCStatus.APPROVED
                user.kyc_level = 4
                user.kyc_provider = "sumsub"
                user.kyc_external_id = applicant_id
                user.kyc_verified_at = datetime.now(UTC)
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_approved(user.id, user.email, 4)
                except Exception as e:
                    log.warning("Corporate KYC notification failed: %s", e)
            elif review_answer == "RED":
                user.kyc_status = KYCStatus.REJECTED
                user.kyc_level = 0

        await self._write_audit(
            actor_id=None,
            action=f"kyb_webhook_{event_type}",
            target_type="user",
            target_id=str(user.id),
            payload={
                "applicant_id": applicant_id,
                "event_type": event_type,
                "review_answer": review_result.get("reviewAnswer") if review_result else None,
            },
            ip_address=ip_address,
        )
        await self.db.commit()

    async def _write_audit(
        self,
        actor_id: UUID | None,
        action: str,
        target_type: str,
        target_id: str,
        payload: dict | None = None,
        ip_address: str | None = None,
        reason: str | None = None,
    ) -> AuditLog:
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
