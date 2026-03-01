"""Integration tests for auth API endpoints."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestRegisterEndpoint:
    """Tests for POST /api/v1/auth/register."""

    async def test_register_success(self, client: AsyncClient) -> None:
        """Test successful registration."""
        email = f"newuser_{uuid4().hex[:8]}@example.com"
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "SecurePass123!"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == email.lower()
        assert "id" in data
        assert "hashed_password" not in data

    async def test_register_invalid_email(self, client: AsyncClient) -> None:
        """Test registration with invalid email."""
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "password": "SecurePass123!"},
        )

        assert response.status_code == 422

    async def test_register_short_password(self, client: AsyncClient) -> None:
        """Test registration with short password."""
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": "test@example.com", "password": "short"},
        )

        assert response.status_code == 422


class TestLoginEndpoint:
    """Tests for POST /api/v1/auth/login."""

    async def test_login_success(self, client: AsyncClient) -> None:
        """Test successful login."""
        email = f"login_{uuid4().hex[:8]}@example.com"
        password = "SecurePass123!"

        # Register first
        await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password},
        )

        # Login
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_invalid_credentials(self, client: AsyncClient) -> None:
        """Test login with invalid credentials."""
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@example.com", "password": "wrong"},
        )

        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["code"] == "INVALID_CREDENTIALS"


class TestRefreshEndpoint:
    """Tests for POST /api/v1/auth/refresh."""

    async def test_refresh_success(self, client: AsyncClient) -> None:
        """Test successful token refresh."""
        email = f"refresh_{uuid4().hex[:8]}@example.com"
        password = "SecurePass123!"

        # Register and login
        await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password},
        )
        login_response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        refresh_token = login_response.json()["refresh_token"]

        # Refresh
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_invalid_token(self, client: AsyncClient) -> None:
        """Test refresh with invalid token."""
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid.token.here"},
        )

        assert response.status_code == 401


class TestMeEndpoint:
    """Tests for GET /api/v1/auth/me."""

    async def test_me_authenticated(self, client: AsyncClient) -> None:
        """Test getting current user info."""
        email = f"me_{uuid4().hex[:8]}@example.com"
        password = "SecurePass123!"

        # Register and login
        await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password},
        )
        login_response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        access_token = login_response.json()["access_token"]

        # Get me
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == email.lower()

    async def test_me_unauthenticated(self, client: AsyncClient) -> None:
        """Test getting user info without auth."""
        response = await client.get("/api/v1/auth/me")

        assert response.status_code == 401
