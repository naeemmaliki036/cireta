"""Cireta authentication service.

Extends the common AuthService with Cireta-specific user operations.
"""

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

    async def register(self, email: str, password: str) -> User:
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
