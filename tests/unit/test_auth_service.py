"""Unit tests for CiretaAuthService."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User
from apps.api.services.auth_service import CiretaAuthService


class TestAuthServiceRegister:
    """Tests for user registration."""

    async def test_register_success(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test successful user registration."""
        email = f"new_{uuid4().hex[:8]}@example.com"
        password = "SecurePass123!"

        user = await auth_service.register(email, password)

        assert user.id is not None
        assert user.email == email.lower()
        assert user.hashed_password != password
        assert auth_service.verify_password(password, user.hashed_password)

    async def test_register_duplicate_email(
        self, db_session: AsyncSession, auth_service: CiretaAuthService, test_user: User
    ) -> None:
        """Test registration with existing email fails."""
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.register(test_user.email, "SomePassword123!")

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["code"] == "EMAIL_EXISTS"

    async def test_register_normalizes_email(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test email is normalized to lowercase."""
        email = f"TEST_{uuid4().hex[:8]}@EXAMPLE.COM"
        user = await auth_service.register(email, "Password123!")

        assert user.email == email.lower()


class TestAuthServiceLogin:
    """Tests for user login."""

    async def test_login_success(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test successful login."""
        email = f"login_{uuid4().hex[:8]}@example.com"
        password = "LoginPass123!"

        # Register first
        await auth_service.register(email, password)

        # Login
        user, access_token, refresh_token = await auth_service.login(email, password)

        assert user.email == email.lower()
        assert access_token is not None
        assert refresh_token is not None
        assert len(access_token) > 0
        assert len(refresh_token) > 0

    async def test_login_invalid_email(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test login with non-existent email fails."""
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.login("nonexistent@example.com", "Password123!")

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_CREDENTIALS"

    async def test_login_invalid_password(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test login with wrong password fails."""
        email = f"wrongpw_{uuid4().hex[:8]}@example.com"
        await auth_service.register(email, "CorrectPassword123!")

        with pytest.raises(HTTPException) as exc_info:
            await auth_service.login(email, "WrongPassword123!")

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_CREDENTIALS"


class TestAuthServiceTokens:
    """Tests for token operations."""

    async def test_refresh_tokens_success(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test successful token refresh."""
        email = f"refresh_{uuid4().hex[:8]}@example.com"
        await auth_service.register(email, "Password123!")
        _, _, refresh_token = await auth_service.login(email, "Password123!")

        new_access, new_refresh = await auth_service.refresh_tokens(refresh_token)

        assert new_access is not None
        assert new_refresh is not None
        assert new_access != refresh_token
        assert new_refresh != refresh_token

    async def test_refresh_tokens_invalid_token(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test refresh with invalid token fails."""
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.refresh_tokens("invalid.token.here")

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_REFRESH_TOKEN"

    async def test_get_current_user_success(
        self, db_session: AsyncSession, auth_service: CiretaAuthService, test_user: User
    ) -> None:
        """Test getting current user."""
        user = await auth_service.get_current_user(test_user.id)

        assert user.id == test_user.id
        assert user.email == test_user.email

    async def test_get_current_user_not_found(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test getting non-existent user fails."""
        with pytest.raises(HTTPException) as exc_info:
            await auth_service.get_current_user(uuid4())

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "USER_NOT_FOUND"


class TestAuthServicePasswordHashing:
    """Tests for password hashing."""

    async def test_hash_password(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test password hashing."""
        password = "TestPassword123!"
        hashed = auth_service.hash_password(password)

        assert hashed != password
        assert hashed.startswith("$2b$")

    async def test_verify_password_correct(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test verifying correct password."""
        password = "TestPassword123!"
        hashed = auth_service.hash_password(password)

        assert auth_service.verify_password(password, hashed) is True

    async def test_verify_password_incorrect(
        self, db_session: AsyncSession, auth_service: CiretaAuthService
    ) -> None:
        """Test verifying incorrect password."""
        hashed = auth_service.hash_password("CorrectPassword!")

        assert auth_service.verify_password("WrongPassword!", hashed) is False
