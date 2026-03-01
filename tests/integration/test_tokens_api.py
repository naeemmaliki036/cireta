"""Integration tests for tokens API endpoints."""

from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.services.auth_service import CiretaAuthService


class TestListTokensEndpoint:
    """Tests for GET /api/v1/tokens/."""

    async def test_list_tokens_public(
        self, client: AsyncClient, test_token: Token
    ) -> None:
        """Test listing tokens without auth."""
        response = await client.get("/api/v1/tokens/")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "size" in data

    async def test_list_tokens_pagination(
        self, client: AsyncClient, test_token: Token
    ) -> None:
        """Test token pagination."""
        response = await client.get("/api/v1/tokens/?page=1&size=5")

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["size"] == 5


class TestGetTokenEndpoint:
    """Tests for GET /api/v1/tokens/{id}."""

    async def test_get_token_success(
        self, client: AsyncClient, test_token: Token
    ) -> None:
        """Test getting a token by ID."""
        response = await client.get(f"/api/v1/tokens/{test_token.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_token.id)
        assert data["name"] == test_token.name
        assert data["symbol"] == test_token.symbol

    async def test_get_token_not_found(self, client: AsyncClient) -> None:
        """Test getting non-existent token."""
        response = await client.get(f"/api/v1/tokens/{uuid4()}")

        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "TOKEN_NOT_FOUND"


class TestCreateTokenEndpoint:
    """Tests for POST /api/v1/tokens/."""

    async def test_create_token_success(
        self,
        client: AsyncClient,
        test_issuer: Issuer,
        test_issuer_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test successful token creation."""
        access_token = auth_service.create_access_token(test_issuer_user.id)

        response = await client.post(
            "/api/v1/tokens/",
            json={
                "name": "New Gold Token",
                "symbol": f"NGT{uuid4().hex[:4].upper()}",
                "asset_type": "commodity",
                "total_supply": "1000000",
                "decimals": 18,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Gold Token"
        assert data["decimals"] == 18

    async def test_create_token_unauthorized(
        self, client: AsyncClient
    ) -> None:
        """Test token creation without auth."""
        response = await client.post(
            "/api/v1/tokens/",
            json={
                "name": "Test Token",
                "symbol": "TEST",
                "asset_type": "commodity",
                "total_supply": "1000000",
            },
        )

        assert response.status_code == 401

    async def test_create_token_not_issuer(
        self,
        client: AsyncClient,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test token creation by non-issuer."""
        access_token = auth_service.create_access_token(test_user.id)

        response = await client.post(
            "/api/v1/tokens/",
            json={
                "name": "Test Token",
                "symbol": "TEST",
                "asset_type": "commodity",
                "total_supply": "1000000",
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 403


class TestDeployTokenEndpoint:
    """Tests for POST /api/v1/tokens/{id}/deploy."""

    async def test_deploy_token_success(
        self,
        client: AsyncClient,
        test_token: Token,
        test_issuer_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test successful token deployment."""
        access_token = auth_service.create_access_token(test_issuer_user.id)

        response = await client.post(
            f"/api/v1/tokens/{test_token.id}/deploy",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["contract_address"] is not None

    async def test_deploy_token_not_authorized(
        self,
        client: AsyncClient,
        test_token: Token,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test deployment by unauthorized user."""
        access_token = auth_service.create_access_token(test_user.id)

        response = await client.post(
            f"/api/v1/tokens/{test_token.id}/deploy",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 403
