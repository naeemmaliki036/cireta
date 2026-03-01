"""Authentication schemas for request/response validation."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = Field(None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # refresh_token omitted — sent as httpOnly cookie


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None  # fallback if cookie unavailable


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(None, max_length=100)


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    kyc_status: str
    kyc_level: int
    display_name: str | None = None
    email_verified: bool = False
    country_code: str | None = None
    investor_type: str = "individual"

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    message: str
