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


def create_hmac_signature(secret_key: str, body: bytes) -> str:
    """Create HMAC-SHA256 signature for webhook payload verification.

    Sumsub signs webhooks with HMAC-SHA256(secret_key, raw_body).
    """
    return hmac.new(secret_key.encode(), body, hashlib.sha256).hexdigest()


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


def _has_sumsub_credentials(settings: Any) -> bool:
    """True if real Sumsub credentials are configured (not placeholders)."""
    token = getattr(settings, "sumsub_app_token", None) or ""
    return bool(token and token.lower() not in ("placeholder", "test", "") and not token.startswith("test-"))


def _persist_verified_kyc_info(user: User, applicant: dict) -> None:
    """Mirror Sumsub's verified `info`/`fixedInfo`/`companyInfo` onto users.verified_*.

    Never overwrites self-reported users.* fields — those are what the user
    typed at onboarding and stay forever for compliance comparison. This
    helper ONLY writes to users.verified_*. Sumsub returns alpha-3 country
    codes and E.164 phones — we store as-is.
    """
    info = applicant.get("info") or applicant.get("fixedInfo") or {}

    # Individual KYC: build a full name from first + middle + last
    first = (info.get("firstName") or "").strip()
    middle = (info.get("middleName") or "").strip()
    last = (info.get("lastName") or "").strip()
    full_name = " ".join(p for p in (first, middle, last) if p)
    if full_name:
        user.verified_full_name = full_name

    if dob := info.get("dob"):
        try:
            user.verified_date_of_birth = datetime.strptime(dob, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            log.warning("Invalid Sumsub dob format for user %s: %s", user.id, dob)

    # Sumsub returns alpha-3 country codes by default
    if nat := info.get("nationality"):
        user.verified_nationality = str(nat).upper()[:3]
    if country := info.get("country"):
        user.verified_country_of_residence = str(country).upper()[:3]
    if phone := info.get("phone"):
        user.verified_phone_number = str(phone)[:32]

    # Corporate / KYB: companyInfo is keyed under info.companyInfo
    company = info.get("companyInfo") or applicant.get("companyInfo") or {}
    if company:
        if name := company.get("companyName"):
            user.verified_company_name = str(name)[:255]
        if reg := company.get("registrationNumber"):
            user.verified_company_registration_number = str(reg)[:100]
        if jur := company.get("country"):
            user.verified_company_jurisdiction = str(jur).upper()[:3]
        if owners := company.get("beneficiaries"):
            # Keep only the fields we render: name + ownership percentage
            user.verified_beneficial_owners = [
                {
                    "name": " ".join(
                        p for p in (
                            (b.get("firstName") or "").strip(),
                            (b.get("lastName") or "").strip(),
                        ) if p
                    ) or b.get("companyName") or "Unknown",
                    "ownership_pct": b.get("share") or b.get("ownershipPct"),
                }
                for b in owners
                if isinstance(b, dict)
            ] or None

    user.kyc_synced_at = datetime.now(UTC)


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

        # Reconcile before minting a new session. If a webhook was lost or
        # the user completed verification via the account-reuse flow (which
        # creates a sibling applicant whose webhook may not have landed),
        # the authoritative status lives on Sumsub. Without this, initiate
        # hands back a fresh access token for an already-verified user.
        if user.sumsub_applicant_id and user.kyc_status not in (
            KYCStatus.APPROVED,
            KYCStatus.REJECTED,
        ):
            pre_app = await self.db.execute(
                select(KYCApplication)
                .where(KYCApplication.user_id == user_id)
                .order_by(KYCApplication.created_at.desc())
            )
            await self._reconcile_from_sumsub(user, pre_app.scalar_one_or_none())

        if user.kyc_status == KYCStatus.APPROVED:
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_VERIFIED", "message": "KYC already approved"},
            )

        # Idempotent re-initiate. Opening the widget is NOT a submission —
        # Sumsub keeps the applicant at reviewStatus=init until documents
        # are actually uploaded + submitted, at which point they fire
        # applicantPending (or applicantReviewed) webhooks. Previously we
        # flipped user.kyc_status=PENDING here which caused the "stuck in
        # review" state when users closed the widget without submitting.
        from packages.common.core.config import get_settings

        settings = get_settings()

        # Re-read after reconcile — L2 may have advanced us to a
        # reuse-chain applicant id.
        existing_applicant_id = user.sumsub_applicant_id
        applicant_id = existing_applicant_id or f"cireta-{user_id}"
        access_token = f"dev-token-{user_id}"

        if not _has_sumsub_credentials(settings):
            if settings.environment != "development":
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "KYC_NOT_CONFIGURED",
                        "message": "KYC service not configured — SUMSUB_APP_TOKEN required",
                    },
                )
            log.warning("Sumsub credentials missing in development — returning mock token for user %s", user_id)
        else:
            try:
                # Create applicant only on first initiate; subsequent calls
                # reuse the existing one and just refresh the access token.
                if not existing_applicant_id:
                    applicant_resp = await _sumsub_request(
                        "POST",
                        f"/resources/applicants?levelName={getattr(settings, 'sumsub_kyc_level', 'id-and-liveness')}",
                        settings.sumsub_app_token,
                        settings.sumsub_secret_key,
                        json={"externalUserId": str(user_id), "email": user.email},
                    )
                    applicant_id = applicant_resp.get("id", applicant_id)

                token_resp = await _sumsub_request(
                    "POST",
                    f"/resources/accessTokens?userId={applicant_id}&levelName={getattr(settings, 'sumsub_kyc_level', 'id-and-liveness')}",
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

        # Create the KYCApplication row only once; reuse on subsequent opens.
        # Status starts as "init" (matches Sumsub's reviewStatus) and is
        # updated via webhook or the status-reconcile in get_status().
        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user_id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()
        if not application:
            application = KYCApplication()
            application.user_id = user_id
            application.sumsub_review_id = applicant_id
            application.status = "init"
            self.db.add(application)
        elif not application.sumsub_review_id:
            application.sumsub_review_id = applicant_id

        user.sumsub_applicant_id = applicant_id
        await self.db.commit()

        return {
            "applicant_id": applicant_id,
            "access_token": access_token,
            "expiration": datetime.now(UTC),
        }

    async def dev_approve(self, user_id: UUID) -> dict[str, Any]:
        """DEV ONLY: Directly approve KYC without Sumsub.

        Sets kyc_status=approved, kyc_level=2, triggers on-chain identity registration.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )
        if user.kyc_status == KYCStatus.APPROVED:
            return {"status": "already_approved", "kyc_level": user.kyc_level}

        user.kyc_status = KYCStatus.APPROVED
        user.kyc_level = 2
        user.kyc_provider = "dev-bypass"
        user.kyc_verified_at = datetime.now(UTC)
        await self._issue_onchain_claims(user)
        await self.db.commit()
        log.info("DEV KYC approved for user %s", user_id)
        return {"status": "approved", "kyc_level": 2}

    async def get_status(self, user_id: UUID) -> dict[str, Any]:
        """Get KYC status for a user.

        If the user has an active Sumsub applicant and the local state
        isn't already terminal (APPROVED / REJECTED), we poll Sumsub's
        applicant-status endpoint and reconcile — that way a delayed or
        lost webhook doesn't leave the UI stuck at a stale status.
        """
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

        if (
            user.sumsub_applicant_id
            and user.kyc_status not in (KYCStatus.APPROVED, KYCStatus.REJECTED)
        ):
            await self._reconcile_from_sumsub(user, application)

        return {
            "status": user.kyc_status.value
            if hasattr(user.kyc_status, "value")
            else user.kyc_status,
            "level": user.kyc_level,
            "review_status": application.status if application else None,
            "submitted_at": application.submitted_at if application else None,
            "reviewed_at": application.reviewed_at if application else None,
        }

    async def _reconcile_from_sumsub(
        self, user: User, application: KYCApplication | None
    ) -> None:
        """Fetch the authoritative reviewStatus from Sumsub and mirror it
        locally. Silently no-ops if Sumsub is unreachable or credentials
        aren't configured — the cached local state is fine as a fallback.
        """
        from packages.common.core.config import get_settings

        settings = get_settings()
        if not _has_sumsub_credentials(settings):
            return
        try:
            resp = await _sumsub_request(
                "GET",
                f"/resources/applicants/{user.sumsub_applicant_id}/status",
                settings.sumsub_app_token,
                settings.sumsub_secret_key,
            )
        except Exception as exc:
            log.warning("Sumsub status reconcile failed for user %s: %s", user.id, exc)
            return

        review_status = resp.get("reviewStatus")

        # Sumsub account-reuse flow: if our applicant is still "init" but
        # the user submitted via the reuse screen, a downstream applicant
        # exists with externalUserId == our original applicant id. Walk
        # the chain to find the authoritative status.
        if review_status == "init":
            try:
                chain = await _sumsub_request(
                    "GET",
                    f"/resources/applicants/-;externalUserId={user.sumsub_applicant_id}/one",
                    settings.sumsub_app_token,
                    settings.sumsub_secret_key,
                )
                chain_id = chain.get("id")
                if chain_id and chain_id != user.sumsub_applicant_id:
                    log.info(
                        "Following Sumsub reuse chain for user %s: %s -> %s",
                        user.id, user.sumsub_applicant_id, chain_id,
                    )
                    user.sumsub_applicant_id = chain_id
                    if application and not application.sumsub_review_id:
                        application.sumsub_review_id = chain_id
                    resp = await _sumsub_request(
                        "GET",
                        f"/resources/applicants/{chain_id}/status",
                        settings.sumsub_app_token,
                        settings.sumsub_secret_key,
                    )
                    review_status = resp.get("reviewStatus")
            except Exception as exc:
                # 404 here is the common case (no reuse applicant exists) —
                # not worth surfacing. Anything else we log but keep the
                # original applicant's status.
                log.debug("No reuse-chain applicant for user %s: %s", user.id, exc)

        review_result = resp.get("reviewResult") or {}
        review_answer = review_result.get("reviewAnswer")
        reject_type = review_result.get("reviewRejectType")

        # Map Sumsub's lifecycle onto our four-state local enum.
        # See https://docs.sumsub.com/docs/applicant-statuses
        new_local_status: KYCStatus | None = None
        if review_status == "init":
            new_local_status = KYCStatus.NONE
        elif review_status in (
            "pending",
            "queued",
            "prechecked",
            "onHold",
            "awaitingService",
            "awaitingUser",
        ):
            new_local_status = KYCStatus.PENDING
        elif review_status == "completed":
            if review_answer == "GREEN":
                new_local_status = KYCStatus.APPROVED
            elif review_answer == "RED":
                # RETRY = resubmission requested — keep user in PENDING so
                # they can upload again; only FINAL is terminal rejection.
                new_local_status = (
                    KYCStatus.REJECTED if reject_type == "FINAL" else KYCStatus.PENDING
                )

        changed = False
        if new_local_status is not None and user.kyc_status != new_local_status:
            user.kyc_status = new_local_status
            changed = True
            # When the reconcile path is the first to see APPROVED (e.g. the
            # webhook didn't fire or arrived late), promote kyc_level too.
            # Without this, can_invest() stays false (it requires level >= 2)
            # and the buyer hits KYC_REQUIRED at /contribute even though their
            # KYC is technically approved.
            if new_local_status == KYCStatus.APPROVED and user.kyc_level < 2:
                user.kyc_level = 2
                if not user.kyc_verified_at:
                    user.kyc_verified_at = datetime.now(UTC)
            # On-chain claim issuance is still driven by the applicantReviewed
            # webhook — it carries the full reviewResult and enqueues the
            # ONCHAINID deployment job. Reconcile path only fixes the local
            # gate so the user can buy.

        if application and review_status and application.status != review_status:
            application.status = review_status
            changed = True

        if changed:
            await self.db.commit()

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
                # Sumsub's account-reuse flow creates a NEW applicant whose
                # externalUserId is the ORIGINAL applicant's id (not a UUID).
                # Recover the user by walking back through that chain.
                result = await self.db.execute(
                    select(User).where(User.sumsub_applicant_id == external_user_id)
                )
                user = result.scalar_one_or_none()
                if user:
                    log.info(
                        "Recovered user %s via reuse-flow chain (prev=%s new=%s)",
                        user.id, external_user_id, applicant_id,
                    )
                    # Point the user at the new applicant so future
                    # reconciles and webhooks resolve directly.
                    user.sumsub_applicant_id = applicant_id

        if not user:
            # Audit the drop so ops can see what slipped through instead of
            # finding out via support ticket.
            log.warning(
                "Sumsub webhook unmatched (applicant=%s externalUserId=%s event=%s)",
                applicant_id, external_user_id, event_type,
            )
            await self._write_audit(
                actor_id=None,
                action="kyc_webhook_unmatched",
                target_type="sumsub_applicant",
                target_id=str(applicant_id),
                payload={
                    "event_type": event_type,
                    "review_status": review_status,
                    "external_user_id": external_user_id,
                },
                ip_address=ip_address,
            )
            await self.db.commit()
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
            # Keep the application pointing at whichever applicant last
            # reported — matters for reuse-chain users where the webhook
            # arrives with a different id than the one we created.
            application.sumsub_review_id = applicant_id
            if review_status == "completed":
                application.reviewed_at = datetime.now(UTC)
            elif (
                review_status in ("pending", "queued", "prechecked")
                or event_type == "applicantPending"
            ) and application.submitted_at is None:
                # Docs have actually been submitted — record the timestamp
                # now (not at initiate time, which only opens the widget).
                application.submitted_at = datetime.now(UTC)

        # applicantPending = user finished uploading docs; Sumsub has
        # queued the review. Transition local state to PENDING so the UI
        # reflects the "under review" badge driven by Sumsub, not by the
        # user merely opening the widget.
        if (
            event_type == "applicantPending"
            or review_status in ("pending", "queued", "prechecked")
        ) and user.kyc_status not in (KYCStatus.APPROVED, KYCStatus.REJECTED):
            user.kyc_status = KYCStatus.PENDING

        if event_type == "applicantReviewed" and review_result:
            review_answer = review_result.get("reviewAnswer")
            if review_answer == "GREEN":
                user.kyc_status = KYCStatus.APPROVED
                user.kyc_level = 2
                user.kyc_provider = "sumsub"
                user.kyc_external_id = applicant_id
                user.kyc_verified_at = datetime.now(UTC)
                # Pull the full applicant payload from Sumsub and mirror the
                # verified personal/corporate fields onto users.verified_*.
                # Webhook itself doesn't carry info — only the applicant
                # endpoint does. Failure here is non-fatal: KYC still
                # approves, we just have empty verified_* until next sync.
                try:
                    from packages.common.core.config import get_settings as _gs
                    s = _gs()
                    if _has_sumsub_credentials(s):
                        applicant = await _sumsub_request(
                            "GET",
                            f"/resources/applicants/{applicant_id}/one",
                            s.sumsub_app_token,
                            s.sumsub_secret_key,
                        )
                        _persist_verified_kyc_info(user, applicant)
                except Exception as exc:
                    log.warning("verified_* sync failed for user %s: %s", user.id, exc)
                await self._issue_onchain_claims(user)
                try:
                    notif_service = NotificationService(self.db)
                    await notif_service.notify_kyc_approved(user.id, user.email)
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
        """Register user's identity on-chain after KYC approval.

        Mode is controlled by IDENTITY_MODE config:
        - "simple": adds wallets to SimpleIdentityRegistry whitelist
        - "erc3643": deploys ONCHAINID + issues claims + registers in full IdentityRegistry

        Dev mode: logs and skips.
        """
        from packages.common.core.config import get_settings

        settings = get_settings()

        if not settings.identity_registry_address:
            log.warning("IDENTITY_REGISTRY_ADDRESS not configured — skipping on-chain identity")
            return

        if settings.identity_mode == "simple":
            await self._register_simple_identity(user, settings)
        else:
            await self._register_erc3643_identity(user, settings)

    async def _register_simple_identity(self, user: User, settings: object) -> None:  # noqa: ARG002
        """Simple whitelist mode — enqueue an identity sync job.

        The actual on-chain call lives in the ``task_sync_identity`` worker
        task. We also fire the inline call as a fast-path so the user sees
        immediate registration on a happy path; the queued job is the
        idempotent safety net (re-checks ``Wallet.registered_on_chain``
        before doing anything).
        """
        # Enqueue first so the safety net exists even if the inline call
        # raises mid-execution.
        try:
            from apps.api.models.enums import IdentitySyncJobAction
            from apps.api.services.identity_sync_service import enqueue_identity_sync

            await enqueue_identity_sync(
                self.db,
                user_id=user.id,
                action=IdentitySyncJobAction.PROVISION,
            )
        except Exception as exc:
            log.warning("Failed to enqueue identity sync for user %s: %s", user.id, exc)

        # Inline fast-path — best-effort, errors are swallowed because the
        # queued job will retry independently. Errors are logged at WARNING
        # with an exception stack *and* written to the audit log so ops can
        # see why a user's wallet never hit `registered_on_chain=true`
        # instead of only discovering it in a support ticket.
        try:
            from apps.api.services.simple_identity_bridge_service import (
                SimpleIdentityBridgeService,
            )
            bridge = SimpleIdentityBridgeService(self.db)
            result = await bridge.provision_identity(user.id)
            log.info(
                "Simple identity registered (inline) for user %s: %d wallet(s)",
                user.id, len(result.get("registered_wallets", [])),
            )
        except Exception as exc:
            log.warning(
                "Inline simple identity registration failed for user %s: %s — "
                "queued job will retry", user.id, exc, exc_info=True,
            )
            try:
                await self._write_audit(
                    actor_id=None,
                    action="identity_sync_inline_failed",
                    target_type="user",
                    target_id=str(user.id),
                    payload={"error": str(exc)[:500]},
                    ip_address=None,
                    reason="Inline on-chain identity registration raised; arq job will retry",
                )
            except Exception:
                pass

    async def _register_erc3643_identity(self, user: User, settings: object) -> None:
        """Full ERC-3643 mode — deploy ONCHAINID + issue claims."""
        if not _has_sumsub_credentials(settings):
            if settings.environment != "development":
                log.error("Sumsub credentials missing in %s — cannot issue on-chain claims", settings.environment)
                return
            log.warning("Dev mode — skipping on-chain identity for user %s (no Sumsub credentials)", user.id)
            return

        primary_wallet = next((w for w in user.wallets if w.is_primary), None)
        if not primary_wallet:
            log.warning("User %s has no primary wallet — cannot deploy ONCHAINID", user.id)
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

            user.onchain_id = identity_address
            log.info(
                "Full ONCHAINID registration complete for user %s: %s",
                user.id,
                identity_address,
            )
        except Exception as exc:
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

        # Reconcile before minting a new session (same reasoning as initiate()).
        if user.sumsub_applicant_id and user.kyc_status not in (
            KYCStatus.APPROVED,
            KYCStatus.REJECTED,
        ):
            pre_app = await self.db.execute(
                select(KYCApplication)
                .where(KYCApplication.user_id == user_id)
                .order_by(KYCApplication.created_at.desc())
            )
            await self._reconcile_from_sumsub(user, pre_app.scalar_one_or_none())

        if user.kyc_status == KYCStatus.APPROVED and user.kyc_level >= 4:
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_VERIFIED", "message": "Corporate KYB already approved"},
            )

        from packages.common.core.config import get_settings

        settings = get_settings()

        # Idempotent re-initiate (same reasoning as individual KYC).
        # Re-read after reconcile — may have advanced to reuse-chain id.
        existing_applicant_id = user.sumsub_applicant_id
        applicant_id = existing_applicant_id or f"cireta-corp-{user_id}"
        access_token = f"dev-corp-token-{user_id}"

        if not _has_sumsub_credentials(settings):
            if settings.environment != "development":
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "KYC_NOT_CONFIGURED",
                        "message": "KYC service not configured — SUMSUB_APP_TOKEN required",
                    },
                )
            log.warning("Sumsub credentials missing in development — returning mock corporate token for user %s", user_id)
        else:
            try:
                if not existing_applicant_id:
                    applicant_resp = await _sumsub_request(
                        "POST",
                        f"/resources/applicants?levelName={getattr(settings, 'sumsub_kyb_level', 'business-kyb-level')}",
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
                    f"/resources/accessTokens?userId={applicant_id}&levelName={getattr(settings, 'sumsub_kyb_level', 'business-kyb-level')}",
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

        app_result = await self.db.execute(
            select(KYCApplication)
            .where(KYCApplication.user_id == user_id)
            .order_by(KYCApplication.created_at.desc())
        )
        application = app_result.scalar_one_or_none()
        corporate_payload = {
            "type": "corporate",
            "company_name": body.company_name,
            "registration_number": body.registration_number,
            "jurisdiction": body.jurisdiction,
            "directors": body.directors,
            "ubo_list": body.ubo_list,
        }
        if not application:
            application = KYCApplication()
            application.user_id = user_id
            application.sumsub_review_id = applicant_id
            application.status = "init"
            application.result_payload = corporate_payload
            self.db.add(application)
        else:
            if not application.sumsub_review_id:
                application.sumsub_review_id = applicant_id
            application.result_payload = corporate_payload

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
                # Reuse-flow chain (see handle_webhook for rationale).
                result = await self.db.execute(
                    select(User).where(User.sumsub_applicant_id == external_user_id)
                )
                user = result.scalar_one_or_none()
                if user:
                    log.info(
                        "Recovered corporate user %s via reuse-flow chain (prev=%s new=%s)",
                        user.id, external_user_id, applicant_id,
                    )
                    user.sumsub_applicant_id = applicant_id
        if not user:
            log.warning(
                "Sumsub corporate webhook unmatched (applicant=%s externalUserId=%s event=%s)",
                applicant_id, external_user_id, event_type,
            )
            await self._write_audit(
                actor_id=None,
                action="kyb_webhook_unmatched",
                target_type="sumsub_applicant",
                target_id=str(applicant_id),
                payload={
                    "event_type": event_type,
                    "review_status": payload.get("reviewStatus"),
                    "external_user_id": external_user_id,
                },
                ip_address=ip_address,
            )
            await self.db.commit()
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
                    await notif_service.notify_kyc_approved(user.id, user.email)
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
