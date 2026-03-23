"""Authentication endpoints."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.tokens import generate_email_verify_token
from apps.api.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from apps.api.services.auth_service import CiretaAuthService
from apps.api.services.email_service import send_email_verify, send_password_reset
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days


async def get_auth_service(db: Annotated[AsyncSession, Depends(get_db)]) -> CiretaAuthService:
    return CiretaAuthService(db)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/auth/refresh",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path="/auth/refresh")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    response: Response,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Register a new user account and send email verification."""
    user = await auth_service.register(
        request.email,
        request.password,
        display_name=request.display_name,
    )
    access_token = auth_service.create_access_token(user.id)
    refresh_token = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)

    # Send verification email (fire-and-forget, don't block registration)
    verify_token = generate_email_verify_token(user.email)
    await send_email_verify(user.email, verify_token)

    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    response: Response,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Authenticate and receive JWT tokens."""
    from sqlalchemy import select

    from apps.api.models.user import User

    # Pre-check for brute force before calling login
    db = auth_service.db
    result = await db.execute(select(User).where(User.email == request.email.lower()))
    user = result.scalar_one_or_none()
    if user:
        await auth_service.check_brute_force(user)

    try:
        user_obj, access_token, refresh_token = await auth_service.login(
            request.email, request.password
        )
    except HTTPException:
        if user:
            await auth_service.record_failed_login(user)
        raise

    await auth_service.clear_failed_login(user_obj)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    response: Response,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
    refresh_cookie: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE)] = None,
    request: RefreshTokenRequest | None = None,
) -> TokenResponse:
    """Refresh access token using httpOnly cookie (or body fallback)."""
    token = refresh_cookie or (request.refresh_token if request else None)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    new_access, new_refresh = await auth_service.refresh_tokens(token)
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=new_access)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    user_id: CurrentUserId,
    response: Response,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
    refresh_cookie: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE)] = None,
) -> MessageResponse:
    """Logout and clear refresh cookie."""
    access_token = credentials.credentials if credentials else ""
    await auth_service.logout(user_id, access_token, refresh_token=refresh_cookie)
    _clear_refresh_cookie(response)
    return MessageResponse(message="Successfully logged out")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MessageResponse:
    """Send password reset email (always returns 200 to avoid email enumeration)."""
    token = await auth_service.forgot_password(request.email)
    if token:
        await send_password_reset(request.email, token)
    return MessageResponse(message="If that email exists, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: ResetPasswordRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MessageResponse:
    """Reset password using signed token."""
    success = await auth_service.reset_password(request.token, request.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token"
        )
    return MessageResponse(message="Password reset successfully. Please log in.")


@router.get("/verify-email/{token}", response_model=MessageResponse)
async def verify_email(
    token: str,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MessageResponse:
    """Verify email address from signed token link."""
    user = await auth_service.verify_email(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification link"
        )
    return MessageResponse(message="Email verified successfully.")


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
        kyc_status=(
            user.kyc_status.value if hasattr(user.kyc_status, "value") else user.kyc_status
        ),
        kyc_level=user.kyc_level,
        display_name=user.display_name,
        email_verified=user.email_verified,
        country_code=user.country_code,
        investor_type=user.investor_type,
    )
