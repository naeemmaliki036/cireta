"""Authentication endpoints.

Rate limits per CLAUDE.md:
- login: 5/min
- register: 10/min
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from apps.api.services.auth_service import CiretaAuthService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


async def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CiretaAuthService:
    """Get Cireta auth service instance."""
    return CiretaAuthService(db)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Register a new user account.

    Rate limit: 10/min (handled by middleware per-endpoint config).
    """
    user = await auth_service.register(request.email, request.password)

    # Generate tokens for immediate login
    access_token = auth_service.create_access_token(user.id)
    refresh_token = auth_service.create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Authenticate and receive JWT tokens.

    Rate limit: 5/min (handled by middleware per-endpoint config).
    """
    _user, access_token, refresh_token = await auth_service.login(
        request.email, request.password
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Refresh access token using refresh token.

    Implements token rotation - the old refresh token becomes invalid.
    """
    new_access_token, new_refresh_token = await auth_service.refresh_tokens(
        request.refresh_token
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    user_id: CurrentUserId,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MessageResponse:
    """Logout and invalidate current tokens."""
    await auth_service.logout(user_id, credentials.credentials)

    return MessageResponse(message="Successfully logged out")


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    user_id: CurrentUserId,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> UserResponse:
    """Get current authenticated user's profile."""
    user = await auth_service.get_current_user(user_id)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        role=(user.role.value if hasattr(user.role, "value") else user.role),
        kyc_status=(user.kyc_status.value if hasattr(user.kyc_status, "value") else user.kyc_status),
        kyc_level=user.kyc_level,
    )
