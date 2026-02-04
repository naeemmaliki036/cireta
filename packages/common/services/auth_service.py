"""Authentication service."""

from datetime import datetime, timedelta, UTC

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.common.core.config import settings
from packages.common.models.user import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Service for authentication operations.

    Handles:
    - Password hashing and verification
    - JWT token creation and validation
    - User lookup from tokens
    """

    def __init__(self, db: Session) -> None:
        """Initialize auth service with database session."""
        self.db = db

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def authenticate_user(self, email: str, password: str) -> User | None:
        """Authenticate a user by email and password.

        Returns the user if credentials are valid, None otherwise.
        """
        user = self._get_user_by_email(email)
        if not user:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user

    def create_access_token(
        self,
        user_id: int,
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
        user_id: int,
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

    async def get_user_from_token(self, token: str) -> User | None:
        """Get a user from a JWT token.

        Returns the user if the token is valid, None otherwise.
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

            return self.db.get(User, int(user_id))
        except (JWTError, ValueError):
            return None

    def _get_user_by_email(self, email: str) -> User | None:
        """Get a user by email address."""
        stmt = select(User).where(User.email == email)
        return self.db.execute(stmt).scalar_one_or_none()
