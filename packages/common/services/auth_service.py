"""Authentication service with async support."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt as _bcrypt
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.core.config import settings


class AuthService:
    """Service for authentication operations.

    Handles:
    - Password hashing and verification
    - JWT token creation and validation
    - User lookup from tokens

    Note: User model is imported dynamically to avoid circular imports.
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialize auth service with async database session."""
        self.db = db

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

    def create_access_token(
        self,
        user_id: UUID,
        expires_delta: timedelta | None = None,
    ) -> str:
        """Create a JWT access token for a user."""
        if expires_delta is None:
            expires_delta = timedelta(seconds=settings.access_token_expire_seconds)

        expire = datetime.now(UTC) + expires_delta
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "type": "access",
        }

        return jwt.encode(
            payload,
            settings.jwt_secret_key or "dev-secret",
            algorithm=settings.jwt_algorithm,
        )

    def create_refresh_token(
        self,
        user_id: UUID,
        expires_delta: timedelta | None = None,
    ) -> str:
        """Create a JWT refresh token for a user."""
        if expires_delta is None:
            expires_delta = timedelta(seconds=settings.refresh_token_expire_seconds)

        expire = datetime.now(UTC) + expires_delta
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "type": "refresh",
        }

        return jwt.encode(
            payload,
            settings.jwt_secret_key or "dev-secret",
            algorithm=settings.jwt_algorithm,
        )

    @staticmethod
    def decode_token(token: str) -> dict | None:
        """Decode and validate a JWT token.

        Returns the payload if valid, None otherwise.
        """
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key or "dev-secret",
                algorithms=[settings.jwt_algorithm],
            )
            return payload
        except JWTError:
            return None

    @staticmethod
    def get_user_id_from_token(token: str) -> UUID | None:
        """Extract user ID from a JWT token.

        Returns the user UUID if token is valid, None otherwise.
        """
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key or "dev-secret",
                algorithms=[settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if user_id is None:
                return None
            return UUID(user_id)
        except (JWTError, ValueError):
            return None
