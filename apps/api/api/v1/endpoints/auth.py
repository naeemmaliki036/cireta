"""Authentication endpoints."""

import os
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

# from apps.api.core.tokens import generate_email_verify_token  # replaced by OTP flow
from apps.api.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    MFABackupCodesResponse,
    MFAEnableRequest,
    MFASetupResponse,
    MFAVerifyRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from apps.api.services.auth_service import CiretaAuthService
from apps.api.services.email_service import EmailService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days


async def get_auth_service(db: Annotated[AsyncSession, Depends(get_db)]) -> CiretaAuthService:
    return CiretaAuthService(db)


_IS_DEV = os.getenv("ENVIRONMENT", "development") == "development"
_COOKIE_PATH = "/api/v1/auth/refresh"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        secure=not _IS_DEV,
        samesite="lax" if _IS_DEV else "strict",
        path=_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path=_COOKIE_PATH)


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

    # Send welcome email (non-blocking)
    try:
        email_svc = EmailService(auth_service.db)
        await email_svc.send("welcome", user.email, {"display_name": user.display_name or ""})
    except Exception:
        pass  # Non-fatal

    return TokenResponse(access_token=access_token)


@router.post("/register/issuer", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_issuer(
    request: RegisterRequest,
    response: Response,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Register a new issuer account. Requires email to be whitelisted."""
    user = await auth_service.register_issuer(
        request.email,
        request.password,
        display_name=request.display_name,
    )
    access_token = auth_service.create_access_token(user.id)
    refresh_token = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)

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
        user_obj, access_token, refresh_token, requires_mfa = await auth_service.login(
            request.email, request.password
        )
    except HTTPException:
        if user:
            await auth_service.record_failed_login(user)
        raise

    await auth_service.clear_failed_login(user_obj)

    if requires_mfa:
        # Return partial MFA token — client must call /auth/mfa/verify
        return TokenResponse(access_token=access_token, requires_mfa=True)

    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token)


# ==================== Passwordless OTP Auth ====================

from pydantic import BaseModel as PydanticBaseModel


class OTPRequestBody(PydanticBaseModel):
    email: str
    purpose: str = "login"


class OTPVerifyBody(PydanticBaseModel):
    email: str
    code: str
    purpose: str = "login"
    display_name: str | None = None


@router.post("/otp/request")
async def request_otp(
    request: OTPRequestBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Request a 6-digit OTP sent to email. In dev mode returns dev_otp for UI toast."""
    from apps.api.services.otp_service import OTPService

    if request.purpose not in ("login", "register", "verify_email"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_PURPOSE", "message": "Must be login, register, or verify_email"})

    from sqlalchemy import select
    from apps.api.models.user import User

    if request.purpose == "login":
        result = await db.execute(select(User).where(User.email == request.email.lower()))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "No account with this email"})

    if request.purpose == "register":
        result = await db.execute(select(User).where(User.email == request.email.lower()))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail={"code": "EMAIL_EXISTS", "message": "Email already registered"})

    otp_svc = OTPService(db)
    return await otp_svc.request_otp(request.email, request.purpose)


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp_endpoint(
    request: OTPVerifyBody,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Verify OTP. For register: creates account. For login: authenticates. For verify_email: marks verified."""
    from apps.api.services.otp_service import OTPService
    from apps.api.services.email_service import EmailService
    from sqlalchemy import select
    from apps.api.models.user import User
    from apps.api.models.enums import UserRole
    from datetime import UTC, datetime

    otp_svc = OTPService(db)
    await otp_svc.verify_otp(request.email, request.code, request.purpose)
    email = request.email.lower().strip()

    if request.purpose == "register":
        user = User()
        user.email = email
        user.display_name = request.display_name or email.split("@")[0]
        user.role = UserRole.INVESTOR
        user.email_verified = True
        user.email_verified_at = datetime.now(UTC)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        email_svc = EmailService(db)
        await email_svc.send("welcome", email, {"display_name": user.display_name or ""})
    elif request.purpose == "verify_email":
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})
        if not user.email_verified:
            user.email_verified = True
            user.email_verified_at = datetime.now(UTC)
            await db.commit()
            email_svc = EmailService(db)
            await email_svc.send("welcome", email, {"display_name": user.display_name or ""})
    else:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    auth_service = CiretaAuthService(db)
    access_token = auth_service.create_access_token(user.id)
    refresh_token = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)
    await db.commit()
    return TokenResponse(access_token=access_token)


# ==================== Google OAuth ====================


class GoogleAuthBody(PydanticBaseModel):
    id_token: str


@router.post("/google", response_model=TokenResponse)
async def google_auth(
    request: GoogleAuthBody,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticate with Google. Auto-registers new investors. Launchpad only."""
    from packages.common.core.config import settings as cfg

    if not cfg.google_client_id:
        raise HTTPException(status_code=501, detail={"code": "GOOGLE_NOT_CONFIGURED", "message": "Google login not available"})

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        idinfo = google_id_token.verify_oauth2_token(request.id_token, google_requests.Request(), cfg.google_client_id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"code": "INVALID_GOOGLE_TOKEN", "message": "Invalid Google token"}) from exc

    google_email = idinfo.get("email", "").lower()
    if not google_email or not idinfo.get("email_verified"):
        raise HTTPException(status_code=400, detail={"code": "UNVERIFIED_EMAIL", "message": "Google email not verified"})

    from sqlalchemy import select
    from apps.api.models.user import User
    from apps.api.models.enums import UserRole
    from datetime import UTC, datetime

    result = await db.execute(select(User).where(User.email == google_email))
    user = result.scalar_one_or_none()

    if not user:
        user = User()
        user.email = google_email
        user.display_name = idinfo.get("name", google_email.split("@")[0])
        user.role = UserRole.INVESTOR
        user.email_verified = True
        user.email_verified_at = datetime.now(UTC)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        from apps.api.services.email_service import EmailService
        await EmailService(db).send("welcome", google_email, {"display_name": user.display_name or ""})

    auth_service = CiretaAuthService(db)
    access_token = auth_service.create_access_token(user.id)
    refresh_token = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)
    await db.commit()
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
        try:
            email_svc = EmailService(auth_service.db)
            await email_svc.send("otp_code", request.email, {"code": token[:6]})
        except Exception:
            pass
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


# --- MFA Endpoints ---


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def mfa_setup(
    user_id: CurrentUserId,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MFASetupResponse:
    """Generate TOTP secret and QR code URI for MFA setup."""
    from apps.api.services.mfa_service import MFAService

    user = await auth_service.get_current_user(user_id)
    mfa_svc = MFAService(auth_service.db)
    result = mfa_svc.setup_mfa(user)
    await auth_service.db.commit()
    return MFASetupResponse(secret=result["secret"], uri=result["uri"])


@router.post("/mfa/enable", response_model=MFABackupCodesResponse)
async def mfa_enable(
    user_id: CurrentUserId,
    request: MFAEnableRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MFABackupCodesResponse:
    """Enable MFA by verifying the initial TOTP code. Returns backup codes."""
    from apps.api.services.mfa_service import MFAService

    user = await auth_service.get_current_user(user_id)
    mfa_svc = MFAService(auth_service.db)
    backup_codes = await mfa_svc.enable_mfa(user, request.code)
    return MFABackupCodesResponse(backup_codes=backup_codes)


@router.post("/mfa/disable", response_model=MessageResponse)
async def mfa_disable(
    user_id: CurrentUserId,
    request: MFAEnableRequest,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> MessageResponse:
    """Disable MFA by verifying current TOTP code."""
    from apps.api.services.mfa_service import MFAService

    user = await auth_service.get_current_user(user_id)
    mfa_svc = MFAService(auth_service.db)
    await mfa_svc.disable_mfa(user, request.code)
    return MessageResponse(message="MFA disabled successfully")


@router.post("/mfa/verify", response_model=TokenResponse)
async def mfa_verify(
    request: MFAVerifyRequest,
    response: Response,
    auth_service: Annotated[CiretaAuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """Complete login by verifying MFA code with partial MFA token."""
    from uuid import UUID as UUIDType

    from jose import JWTError, jwt

    from packages.common.core.config import settings

    # Decode the MFA token
    try:
        payload = jwt.decode(
            request.mfa_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_MFA_TOKEN", "message": "Invalid or expired MFA token"},
        ) from exc

    if payload.get("type") != "mfa":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_MFA_TOKEN", "message": "Not an MFA token"},
        )

    user_id = UUIDType(payload["sub"])
    user = await auth_service.get_current_user(user_id)

    # Verify the TOTP code
    from apps.api.services.mfa_service import MFAService

    mfa_svc = MFAService(auth_service.db)
    if not mfa_svc.verify_mfa(user, request.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_MFA_CODE", "message": "Invalid MFA code"},
        )

    await auth_service.db.commit()

    # Issue real tokens
    access_token = auth_service.create_access_token(user_id)
    refresh_token = auth_service.create_refresh_token(user_id)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token)
