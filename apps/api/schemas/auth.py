"""Authentication schemas for request/response validation."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str


class UserResponse(BaseModel):
    """User data response."""

    id: str
    email: str
    role: str
    kyc_status: str
    kyc_level: int

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str
