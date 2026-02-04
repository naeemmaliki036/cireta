"""Service factory functions for dependency injection."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from packages.common.db.session import get_db
from packages.common.services.auth_service import AuthService


async def get_auth_service(
    db: Annotated[Session, Depends(get_db)]
) -> AuthService:
    """Factory function for AuthService.

    Usage in endpoints:
        @router.post("/login")
        async def login(
            auth_service: Annotated[AuthService, Depends(get_auth_service)]
        ):
            ...
    """
    return AuthService(db)


# Add more service factories as needed:
#
# async def get_user_service(
#     db: Annotated[Session, Depends(get_db)],
#     auth_service: Annotated[AuthService, Depends(get_auth_service)],
# ) -> UserService:
#     return UserService(db, auth_service)
