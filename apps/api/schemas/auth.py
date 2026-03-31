"""Authentication schemas for request/response validation."""

import html
import re

from pydantic import BaseModel, EmailStr, Field, field_validator

_PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]).{8,128}$"
)

# Strip HTML tags for XSS prevention
_HTML_TAG_RE = re.compile(r"<[^>]+>")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, one digit, and one special character"
            )
        return v
    display_name: str | None = Field(None, max_length=100)

    @field_validator("display_name")
    @classmethod
    def sanitize_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        # Strip HTML tags (XSS prevention)
        v = _HTML_TAG_RE.sub("", v)
        # HTML-escape remaining special chars
        v = html.escape(v, quote=True)
        # Strip and reject whitespace-only
        v = v.strip()
        if not v:
            return None
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requires_mfa: bool = False
    # refresh_token omitted — sent as httpOnly cookie


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None  # fallback if cookie unavailable


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, one digit, and one special character"
            )
        return v


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(None, max_length=100)

    @field_validator("display_name")
    @classmethod
    def sanitize_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = _HTML_TAG_RE.sub("", v)
        v = html.escape(v, quote=True)
        v = v.strip()
        if not v:
            return None
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    kyc_status: str
    kyc_level: int
    display_name: str | None = None
    email_verified: bool = False
    country_code: str | None = None
    investor_type: str | None = None
    onboarding_completed: bool = False

    class Config:
        from_attributes = True


class MFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)
    mfa_token: str


class MFASetupResponse(BaseModel):
    secret: str
    uri: str


class MFAEnableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class MFABackupCodesResponse(BaseModel):
    backup_codes: list[str]


class MessageResponse(BaseModel):
    message: str


# ==================== Onboarding Schemas ====================


class OnboardingTypeRequest(BaseModel):
    investor_type: str  # "individual" or "corporate"


class OnboardingDetailsRequest(BaseModel):
    # Individual
    date_of_birth: str | None = None
    nationality: str | None = None
    country_of_residence: str | None = None
    # Corporate
    company_name: str | None = None
    company_registration_number: str | None = None
    company_jurisdiction: str | None = None


class OnboardingStepStatus(BaseModel):
    completed: bool
    optional: bool = False
    label: str


class OnboardingStatusResponse(BaseModel):
    investor_type: str
    steps: dict[str, OnboardingStepStatus]
    completed: bool
    completed_count: int
    total_required: int
