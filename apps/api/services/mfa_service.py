"""MFA (TOTP) service — setup, verify, backup codes."""

from __future__ import annotations

import logging
import secrets

import pyotp
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User

logger = logging.getLogger(__name__)

BACKUP_CODE_COUNT = 8
BACKUP_CODE_LENGTH = 8


class MFAService:
    """TOTP-based multi-factor authentication."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def setup_mfa(self, user: User) -> dict:
        """Generate TOTP secret and provisioning URI for QR code.

        Returns:
            {"secret": str, "uri": str}
        """
        secret = pyotp.random_base32()
        user.mfa_secret = secret
        uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=user.email,
            issuer_name="Cireta",
        )
        return {"secret": secret, "uri": uri}

    def verify_mfa(self, user: User, code: str) -> bool:
        """Verify a 6-digit TOTP code or backup code.

        Returns True if valid, False otherwise.
        """
        if not user.mfa_secret:
            return False

        # Check TOTP code (with 1-step window for clock skew)
        totp = pyotp.TOTP(user.mfa_secret)
        if totp.verify(code, valid_window=1):
            return True

        # Check backup codes
        if user.mfa_backup_codes:
            codes = user.mfa_backup_codes.split(",")
            if code in codes:
                codes.remove(code)
                user.mfa_backup_codes = ",".join(codes) if codes else None
                return True

        return False

    def generate_backup_codes(self, user: User) -> list[str]:
        """Generate fresh backup codes and store on user.

        Returns list of plaintext backup codes to show user once.
        """
        codes = [
            secrets.token_hex(BACKUP_CODE_LENGTH // 2).upper()
            for _ in range(BACKUP_CODE_COUNT)
        ]
        user.mfa_backup_codes = ",".join(codes)
        return codes

    async def enable_mfa(self, user: User, code: str) -> list[str]:
        """Enable MFA after verifying the initial TOTP code.

        Returns backup codes on success.
        """
        if not user.mfa_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MFA_NOT_SETUP", "message": "Call setup_mfa first"},
            )

        if not self.verify_mfa(user, code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_MFA_CODE", "message": "Invalid verification code"},
            )

        backup_codes = self.generate_backup_codes(user)
        user.mfa_enabled = True
        await self.db.commit()
        await self.db.refresh(user)
        return backup_codes

    async def disable_mfa(self, user: User, code: str) -> None:
        """Disable MFA after verifying code."""
        if not self.verify_mfa(user, code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_MFA_CODE", "message": "Invalid verification code"},
            )

        user.mfa_enabled = False
        user.mfa_secret = None
        user.mfa_backup_codes = None
        await self.db.commit()
