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


def _extract_user_id(
    credentials: HTTPAuthorizationCredentials | None,
    required_audience: str | None = None,
) -> UUID:
    """Shared helper: extract user ID from credentials, optionally enforcing audience."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = AuthService.get_user_id_from_token(
        credentials.credentials, required_audience=required_audience
    )
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


async def get_current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID:
    """Get the current authenticated user ID from JWT token (any audience)."""
    return _extract_user_id(credentials)


async def get_current_user_id_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID | None:
    """Get the current user ID if authenticated, None otherwise."""
    if not credentials:
        return None
    return AuthService.get_user_id_from_token(credentials.credentials)


async def get_investor_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID:
    """Get user ID, requiring investor audience token."""
    return _extract_user_id(credentials, required_audience="investor")


async def get_admin_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> UUID:
    """Get user ID, requiring admin audience token."""
    return _extract_user_id(credentials, required_audience="admin")


# Type aliases for cleaner endpoint signatures
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
OptionalUserId = Annotated[UUID | None, Depends(get_current_user_id_optional)]


async def require_admin(
    user_id: Annotated[UUID, Depends(get_admin_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UUID:
    """Require user to have admin role AND admin-audience token. Returns user_id if authorized."""
    from sqlalchemy import select

    from apps.api.models.enums import UserRole
    from apps.api.models.user import User

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ADMIN_REQUIRED", "message": "Platform admin role required"},
        )
    return user_id


async def require_issuer_or_admin(
    user_id: Annotated[UUID, Depends(get_admin_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UUID:
    """Require user to have issuer or admin role AND admin-audience token. Returns user_id if authorized."""
    from sqlalchemy import select

    from apps.api.models.enums import UserRole
    from apps.api.models.user import User

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.role not in (UserRole.ADMIN, UserRole.ISSUER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ROLE_REQUIRED", "message": "Issuer or admin role required"},
        )
    return user_id


RequireAdmin = Annotated[UUID, Depends(require_admin)]
RequireIssuerOrAdmin = Annotated[UUID, Depends(require_issuer_or_admin)]
