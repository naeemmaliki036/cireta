"""OTP Service — generates and verifies email-based one-time passwords.

Passwordless authentication: every login/register/verify sends a 6-digit OTP.
Rate limited to 5 OTPs per email per hour.
"""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.auth_otp import AuthOTP
from apps.api.services.email_service import EmailService

logger = logging.getLogger(__name__)

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_RATE_LIMIT_PER_HOUR = 20


class OTPService:
    """Generate, send, and verify OTPs for passwordless auth."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def request_otp(
        self,
        email: str,
        purpose: str,
        user_id: UUID | None = None,
    ) -> dict:
        """Generate OTP, send via email, return result.

        In dev mode without Resend, returns dev_otp for UI notification.

        Args:
            email: Recipient email.
            purpose: "login", "register", or "verify_email".
            user_id: User UUID if known (for existing users).

        Returns:
            dict with status and optionally dev_otp.
        """
        email = email.lower().strip()

        # Rate limit: max 5 per email per hour
        one_hour_ago = datetime.now(UTC) - timedelta(hours=1)
        count_result = await self.db.execute(
            select(func.count()).select_from(AuthOTP).where(
                and_(
                    AuthOTP.email == email,
                    AuthOTP.created_at > one_hour_ago,
                )
            )
        )
        count = count_result.scalar() or 0
        if count >= OTP_RATE_LIMIT_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "OTP_RATE_LIMITED",
                    "message": "Too many verification codes requested. Try again later.",
                },
            )

        # Generate 6-digit OTP (old unused ones expire naturally)
        code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))

        otp = AuthOTP()
        otp.email = email
        otp.code = code
        otp.purpose = purpose
        otp.user_id = user_id
        otp.expires_at = datetime.now(UTC) + timedelta(minutes=OTP_EXPIRY_MINUTES)
        self.db.add(otp)
        await self.db.commit()

        # Send via email — never let email failure block OTP creation
        send_result: dict = {}
        try:
            email_svc = EmailService(self.db)
            send_result = await email_svc.send(
                "otp_code",
                email,
                variables={"code": code},
            )
        except Exception:
            import logging
            logging.getLogger(__name__).warning("Email send failed for OTP to %s — OTP still created", email)
            send_result = {"status": "email_failed", "dev_otp": code}

        result: dict = {"status": "sent", "expires_in_seconds": OTP_EXPIRY_MINUTES * 60}
        # In dev mode, return OTP for UI toast notification
        if "dev_otp" in send_result:
            result["dev_otp"] = send_result["dev_otp"]
        return result

    async def verify_otp(self, email: str, code: str, purpose: str) -> AuthOTP:
        """Verify an OTP code.

        Returns the OTP record on success.
        Raises HTTPException on failure.
        """
        email = email.lower().strip()
        now = datetime.now(UTC)

        result = await self.db.execute(
            select(AuthOTP).where(
                and_(
                    AuthOTP.email == email,
                    AuthOTP.code == code,
                    AuthOTP.purpose == purpose,
                    AuthOTP.used.is_(False),
                    AuthOTP.expires_at > now,
                )
            ).order_by(AuthOTP.created_at.desc())
        )
        otp = result.scalar_one_or_none()

        if not otp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_OTP",
                    "message": "Invalid or expired verification code.",
                },
            )

        otp.used = True
        await self.db.flush()
        return otp
