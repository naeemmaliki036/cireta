"""Signed token generation for email verify and password reset."""

from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from packages.common.core.config import settings


def _serializer(salt: str) -> URLSafeTimedSerializer:
    secret = settings.jwt_secret_key
    if not secret:
        raise RuntimeError("jwt_secret_key is not configured — refusing to sign tokens")
    return URLSafeTimedSerializer(secret, salt=salt)


def generate_email_verify_token(email: str) -> str:
    """Generate a signed email verification token (24h expiry)."""
    return _serializer("email-verify").dumps(email)


def verify_email_verify_token(token: str, max_age: int = 86400) -> str | None:
    """Verify email token. Returns email or None if invalid/expired."""
    try:
        return _serializer("email-verify").loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def generate_password_reset_token(email: str) -> str:
    """Generate a signed password reset token (1h expiry)."""
    return _serializer("password-reset").dumps(email)


def verify_password_reset_token(token: str, max_age: int = 3600) -> str | None:
    """Verify password reset token. Returns email or None if invalid/expired."""
    try:
        return _serializer("password-reset").loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
