"""Cireta authentication service.

Extends the common AuthService with Cireta-specific user operations.
"""

import hashlib
from datetime import UTC
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select

from apps.api.models.enums import IssuerStatus, UserRole
from apps.api.models.issuer import Issuer
from apps.api.models.issuer_whitelist import IssuerWhitelist
from apps.api.models.user import User
from packages.common.services.auth_service import (
    AuthService as BaseAuthService,
)
from packages.common.services.auth_service import (
    _token_blacklist,
)


class CiretaAuthService(BaseAuthService):
    """Extended auth service for Cireta platform.

    Handles:
    - User registration and login
    - Token refresh with rotation
    - Current user retrieval
    """

    async def register(self, email: str, password: str, display_name: str | None = None) -> User:
        """Register a new investor account.

        Returns:
            Created user object with role=INVESTOR.

        Raises:
            HTTPException: If email already exists.
        """
        await self._check_email_exists(email)

        user = User()
        user.email = email.lower()
        user.hashed_password = self.hash_password(password)
        user.display_name = display_name

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def register_issuer(self, email: str, password: str, display_name: str | None = None) -> User:
        """Register a new issuer account. Requires email to be whitelisted.

        Returns:
            Created user object with role=ISSUER + linked Issuer record.

        Raises:
            HTTPException: If email not whitelisted or already exists.
        """
        await self._check_email_exists(email)

        # Enforce whitelist
        whitelist_result = await self.db.execute(
            select(IssuerWhitelist).where(
                IssuerWhitelist.email == email.lower(),
                IssuerWhitelist.registered_at.is_(None),
            )
        )
        whitelist_entry = whitelist_result.scalar_one_or_none()

        if not whitelist_entry:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NOT_WHITELISTED",
                    "message": "This email is not whitelisted. Contact admin@cireta.io to get approved before registering.",
                },
            )

        user = User()
        user.email = email.lower()
        user.hashed_password = self.hash_password(password)
        user.display_name = display_name
        user.role = UserRole.ISSUER

        self.db.add(user)
        await self.db.flush()

        from datetime import datetime, UTC as _UTC
        issuer = Issuer()
        issuer.user_id = user.id
        issuer.name = display_name or email.split("@")[0]
        issuer.slug = email.split("@")[0].replace(".", "-").replace("+", "-").lower()
        issuer.issuer_type = whitelist_entry.issuer_type
        issuer.status = IssuerStatus.PENDING
        self.db.add(issuer)

        whitelist_entry.registered_at = datetime.now(_UTC)

        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def _check_email_exists(self, email: str) -> None:
        existing = await self.db.execute(select(User).where(User.email == email.lower()))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "Email already registered"},
            )

    async def login(
        self, email: str, password: str
    ) -> tuple[User, str, str, bool]:
        """Authenticate user and return tokens.

        Args:
            email: User email address.
            password: Plain text password.

        Returns:
            Tuple of (user, access_token, refresh_token, requires_mfa).
            If requires_mfa is True, access_token is a partial MFA token
            that can only be used with the /auth/mfa/verify endpoint.

        Raises:
            HTTPException: If credentials are invalid.
        """
        # Find user by email
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()

        if not user or not self.verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_CREDENTIALS",
                    "message": "Invalid email or password",
                },
            )

        if user.mfa_enabled:
            # Return partial MFA token — short-lived, type=mfa
            mfa_token = self.create_token(
                user.id, token_type="mfa", expire_seconds=300
            )
            return user, mfa_token, "", True

        # Generate tokens
        access_token = self.create_access_token(user.id)
        refresh_token = self.create_refresh_token(user.id)

        return user, access_token, refresh_token, False

    def create_token(self, user_id: UUID, token_type: str, expire_seconds: int) -> str:
        """Create a JWT with custom type and expiry."""
        from datetime import timedelta

        from jose import jwt

        from packages.common.core.config import settings

        now = __import__("datetime").datetime.now(__import__("datetime").UTC)
        payload = {
            "sub": str(user_id),
            "exp": now + timedelta(seconds=expire_seconds),
            "type": token_type,
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    async def refresh_tokens(self, refresh_token: str) -> tuple[str, str]:
        """Refresh access and refresh tokens.

        Implements token rotation - old refresh token is invalidated.

        Args:
            refresh_token: Current refresh token.

        Returns:
            Tuple of (new_access_token, new_refresh_token).

        Raises:
            HTTPException: If refresh token is invalid.
        """
        payload = self.decode_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_REFRESH_TOKEN",
                    "message": "Invalid or expired refresh token",
                },
            )

        user_id = UUID(payload["sub"])

        # Verify user still exists
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "USER_NOT_FOUND", "message": "User no longer exists"},
            )

        # Blacklist old refresh token before generating new ones
        old_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        _token_blacklist.add(old_hash)

        # Generate new tokens (rotation)
        new_access_token = self.create_access_token(user_id)
        new_refresh_token = self.create_refresh_token(user_id)

        return new_access_token, new_refresh_token

    async def get_current_user(self, user_id: UUID) -> User:
        """Get the full user object for an authenticated user.

        Args:
            user_id: User UUID from token.

        Returns:
            User object.

        Raises:
            HTTPException: If user not found.
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        return user

    async def logout(
        self,
        _user_id: UUID,
        access_token: str,
        refresh_token: str | None = None,
    ) -> None:
        """Logout user by invalidating the access and refresh tokens.

        Args:
            _user_id: User UUID (unused but kept for interface consistency).
            access_token: Current access token to invalidate.
            refresh_token: Current refresh token to invalidate (prevents reuse).
        """
        if access_token:
            token_hash = hashlib.sha256(access_token.encode()).hexdigest()
            _token_blacklist.add(token_hash)
        if refresh_token:
            refresh_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            _token_blacklist.add(refresh_hash)

    async def check_brute_force(self, user: User) -> None:
        """Raise 429 if account is locked from too many failed attempts."""
        if user.is_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": "Account temporarily locked. Try again later.",
                },
            )

    async def record_failed_login(self, user: User) -> None:
        """Increment failed login counter; lock if threshold exceeded."""
        from datetime import datetime, timedelta

        MAX_ATTEMPTS = 5
        LOCKOUT_MINUTES = 15
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_ATTEMPTS:
            user.locked_until = datetime.now(UTC) + timedelta(minutes=LOCKOUT_MINUTES)
        await self.db.commit()

    async def clear_failed_login(self, user: User) -> None:
        """Reset failed login counter on successful login."""
        user.failed_login_attempts = 0
        user.locked_until = None
        await self.db.commit()

    async def forgot_password(self, email: str) -> str | None:
        """Initiate password reset. Returns signed token or None if user not found."""
        from sqlalchemy import select

        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            return None  # Don't reveal if email exists
        from apps.api.core.tokens import generate_password_reset_token

        token = generate_password_reset_token(user.email)
        return token

    async def reset_password(self, token: str, new_password: str) -> bool:
        """Reset password from signed token. Returns True on success."""
        from sqlalchemy import select

        from apps.api.core.tokens import verify_password_reset_token

        email = verify_password_reset_token(token)
        if not email:
            return False
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            return False
        user.hashed_password = self.hash_password(new_password)
        user.failed_login_attempts = 0
        user.locked_until = None
        await self.db.commit()
        return True

    async def verify_email(self, token: str) -> User | None:
        """Verify email from signed token. Returns user or None."""
        from datetime import datetime

        from sqlalchemy import select

        from apps.api.core.tokens import verify_email_verify_token

        email = verify_email_verify_token(token)
        if not email:
            return None
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            return None
        user.email_verified = True
        user.email_verified_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(user)
        return user
