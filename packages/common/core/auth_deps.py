"""Authentication dependencies for FastAPI."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from packages.common.db.session import get_db
from packages.common.models.user import User, UserRole
from packages.common.services.auth_service import AuthService

from sqlalchemy.orm import Session


security = HTTPBearer(auto_error=False)


async def get_auth_service(
    db: Annotated[Session, Depends(get_db)]
) -> AuthService:
    """Get AuthService instance with database session."""
    return AuthService(db)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> User:
    """Get the current authenticated user from JWT token.

    Raises:
        HTTPException: If token is missing, invalid, or user not found.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await auth_service.get_user_from_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "USER_INACTIVE", "message": "User account is disabled"},
        )

    return user


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> User | None:
    """Get the current user if authenticated, None otherwise."""
    if not credentials:
        return None

    return await auth_service.get_user_from_token(credentials.credentials)


def require_role(*roles: UserRole):
    """Dependency factory that requires specific user roles.

    Usage:
        @router.get("/admin")
        async def admin_only(user: User = Depends(require_role(UserRole.ADMIN))):
            ...
    """
    async def role_checker(
        user: Annotated[User, Depends(get_current_user)]
    ) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": f"Required roles: {[r.value for r in roles]}",
                },
            )
        return user

    return role_checker


# Type aliases for cleaner endpoint signatures
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]
