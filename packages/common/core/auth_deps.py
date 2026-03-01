"""Authentication dependencies for FastAPI.

These are base dependencies. Application-specific user handling
should be done in apps/api/ with the Cireta User model.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.db.session import get_db
from packages.common.services.auth_service import AuthService

security = HTTPBearer(auto_error=False)


async def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthService:
    """Get AuthService instance with database session."""
    return AuthService(db)


async def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID:
    """Get the current authenticated user ID from JWT token.

    Returns the user UUID from the token. Use this when you only need
    the user ID for permission checks or queries.

    Raises:
        HTTPException: If token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = AuthService.get_user_id_from_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


async def get_current_user_id_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID | None:
    """Get the current user ID if authenticated, None otherwise."""
    if not credentials:
        return None

    return AuthService.get_user_id_from_token(credentials.credentials)


# Type aliases for cleaner endpoint signatures
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
OptionalUserId = Annotated[UUID | None, Depends(get_current_user_id_optional)]
