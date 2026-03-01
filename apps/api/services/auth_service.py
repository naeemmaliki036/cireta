"""Cireta authentication service.

Extends the common AuthService with Cireta-specific user operations.
"""

from datetime import UTC
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select

from apps.api.models.user import User
from packages.common.services.auth_service import AuthService as BaseAuthService


class CiretaAuthService(BaseAuthService):
    """Extended auth service for Cireta platform.

    Handles:
    - User registration and login
    - Token refresh with rotation
    - Current user retrieval
    """

    async def register(self, email: str, password: str, display_name: str | None = None) -> User:
        """Register a new user.

        Args:
            email: User email address.
            password: Plain text password.

        Returns:
            Created user object.

        Raises:
            HTTPException: If email already exists.
        """
        # Check if user exists
        existing = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "Email already registered"},
            )

        # Create user with hashed password
        user = User()
        user.email = email.lower()
        user.hashed_password = self.hash_password(password)
        user.display_name = display_name

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def login(self, email: str, password: str) -> tuple[User, str, str]:
        """Authenticate user and return tokens.

        Args:
            email: User email address.
            password: Plain text password.

        Returns:
            Tuple of (user, access_token, refresh_token).

        Raises:
            HTTPException: If credentials are invalid.
        """
        # Find user by email
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        user = result.scalar_one_or_none()

        if not user or not self.verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_CREDENTIALS",
                    "message": "Invalid email or password",
                },
            )

        # Generate tokens
        access_token = self.create_access_token(user.id)
        refresh_token = self.create_refresh_token(user.id)

        return user, access_token, refresh_token

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

        # Generate new tokens (rotation)
        new_access_token = self.create_access_token(user_id)
        new_refresh_token = self.create_refresh_token(user_id)

        # TODO: Store old token hash in Redis blacklist for true invalidation

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

    async def logout(self, _user_id: UUID, _access_token: str) -> None:
        """Logout user by invalidating tokens.

        Args:
            user_id: User UUID.
            access_token: Current access token to invalidate.

        Note:
            TODO: Implement Redis-based token blacklist for true invalidation.
            For now, logout is handled client-side by discarding tokens.
        """
        # TODO: Store token hash in Redis blacklist
        # For now, client-side token removal is sufficient
        pass

    async def check_brute_force(self, user: User) -> None:
        """Raise 429 if account is locked from too many failed attempts."""
        if user.is_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "ACCOUNT_LOCKED", "message": "Account temporarily locked. Try again later."},
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
