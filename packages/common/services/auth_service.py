"""Authentication service with async support."""

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt as _bcrypt
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.core.config import settings

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redis-backed JWT blacklist (falls back to in-memory set if Redis unavailable)
# ---------------------------------------------------------------------------
_in_memory_blacklist: set[str] = set()
_redis_client = None
_BLACKLIST_KEY_PREFIX = "jwt:blacklist:"
_BLACKLIST_TTL = settings.refresh_token_expire_seconds + 60  # outlive longest token


def _get_redis():
    """Lazily initialise a Redis client from settings.redis_url."""
    global _redis_client  # noqa: PLW0603
    if _redis_client is not None:
        return _redis_client
    if not settings.redis_url:
        return None
    try:
        import redis as _redis_mod

        _redis_client = _redis_mod.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        _redis_client.ping()
        _logger.info("JWT blacklist: using Redis at %s", settings.redis_url)
        return _redis_client
    except Exception:
        _logger.warning("JWT blacklist: Redis unavailable, falling back to in-memory set")
        _redis_client = None
        return None


class _TokenBlacklist:
    """Unified interface: uses Redis when available, else in-memory set."""

    def add(self, token_hash: str) -> None:
        r = _get_redis()
        if r is not None:
            try:
                r.setex(f"{_BLACKLIST_KEY_PREFIX}{token_hash}", _BLACKLIST_TTL, "1")
                return
            except Exception:
                _logger.warning("Redis SET failed, falling back to in-memory")
        _in_memory_blacklist.add(token_hash)

    def __contains__(self, token_hash: str) -> bool:
        r = _get_redis()
        if r is not None:
            try:
                return r.exists(f"{_BLACKLIST_KEY_PREFIX}{token_hash}") > 0
            except Exception:
                _logger.warning("Redis EXISTS failed, falling back to in-memory")
        return token_hash in _in_memory_blacklist


_token_blacklist = _TokenBlacklist()


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

        secret = settings.jwt_secret_key
        if not secret:
            raise RuntimeError("jwt_secret_key is not configured — refusing to sign tokens")
        return jwt.encode(
            payload,
            secret,
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

        secret = settings.jwt_secret_key
        if not secret:
            raise RuntimeError("jwt_secret_key is not configured — refusing to sign tokens")
        return jwt.encode(
            payload,
            secret,
            algorithm=settings.jwt_algorithm,
        )

    @staticmethod
    def decode_token(token: str) -> dict | None:
        """Decode and validate a JWT token.

        Returns the payload if valid, None if invalid or blacklisted.
        """
        try:
            # Check if token has been blacklisted (logout / rotation)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            if token_hash in _token_blacklist:
                return None

            secret = settings.jwt_secret_key
            if not secret:
                return None
            payload = jwt.decode(
                token,
                secret,
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
            secret = settings.jwt_secret_key
            if not secret:
                return None
            payload = jwt.decode(
                token,
                secret,
                algorithms=[settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if user_id is None:
                return None
            return UUID(user_id)
        except (JWTError, ValueError):
            return None
