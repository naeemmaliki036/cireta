"""Integration tests for sales API endpoints."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient
from tests.conftest import make_tx_hash

from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.auth_service import CiretaAuthService


class TestListSalesEndpoint:
    """Tests for GET /api/v1/sales/."""

    async def test_list_sales_public(self, client: AsyncClient, test_sale: TokenSale) -> None:
        """Test listing sales without auth."""
        response = await client.get("/api/v1/sales")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    async def test_list_sales_with_status_filter(
        self, client: AsyncClient, test_sale: TokenSale
    ) -> None:
        """Test listing sales with status filter returns only matching status."""
        response = await client.get(f"/api/v1/sales?status={str(test_sale.status)}")

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        for item in data["items"]:
            assert item["status"] == str(test_sale.status)


class TestGetSaleEndpoint:
    """Tests for GET /api/v1/sales/{id}."""

    async def test_get_sale_success(self, client: AsyncClient, test_sale: TokenSale) -> None:
        """Test getting a sale by ID."""
        response = await client.get(f"/api/v1/sales/{test_sale.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_sale.id)
        assert "phases" in data
        assert len(data["phases"]) >= 1

    async def test_get_sale_not_found(self, client: AsyncClient) -> None:
        """Test getting non-existent sale."""
        response = await client.get(f"/api/v1/sales/{uuid4()}")

        assert response.status_code == 404


class TestCreateSaleEndpoint:
    """Tests for POST /api/v1/sales/."""

    async def test_create_sale_success(
        self,
        client: AsyncClient,
        test_token: Token,
        test_issuer_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test successful sale creation."""
        access_token = auth_service.create_access_token(test_issuer_user.id)
        now = datetime.now(UTC)

        response = await client.post(
            "/api/v1/sales",
            json={
                "token_id": str(test_token.id),
                "payment_token": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                "soft_cap": "50000",
                "hard_cap": "200000",
                "phases": [
                    {
                        "name": "Private Sale",
                        "price_per_token": "1.00",
                        "allocation": "100000",
                        "min_contribution": "100",
                        "max_contribution": "10000",
                        "top_up_min": "1000",
                        "start_time": (now + timedelta(hours=1)).isoformat(),
                        "end_time": (now + timedelta(days=30)).isoformat(),
                    }
                ],
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "draft"

    async def test_create_sale_unauthorized(self, client: AsyncClient) -> None:
        """Test sale creation without auth."""
        response = await client.post(
            "/api/v1/sales",
            json={
                "token_id": str(uuid4()),
                "payment_token": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                "soft_cap": "50000",
                "hard_cap": "200000",
                "phases": [],
            },
        )

        assert response.status_code == 401


class TestContributeEndpoint:
    """Tests for POST /api/v1/sales/{id}/contribute."""

    async def test_contribute_success(
        self,
        client: AsyncClient,
        test_sale: TokenSale,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test successful contribution."""
        access_token = auth_service.create_access_token(test_user.id)
        tx_hash = make_tx_hash()

        response = await client.post(
            f"/api/v1/sales/{test_sale.id}/contribute",
            json={
                "amount": "1000",
                "tx_hash": tx_hash,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert float(data["amount"]) == 1000.0
        assert data["status"] == "pending"

    async def test_contribute_unauthorized(self, client: AsyncClient, test_sale: TokenSale) -> None:
        """Test contribution without auth."""
        response = await client.post(
            f"/api/v1/sales/{test_sale.id}/contribute",
            json={
                "amount": "1000",
                "tx_hash": make_tx_hash(),
            },
        )

        assert response.status_code == 401

    async def test_contribute_below_minimum(
        self,
        client: AsyncClient,
        test_sale: TokenSale,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test contribution below minimum."""
        access_token = auth_service.create_access_token(test_user.id)

        response = await client.post(
            f"/api/v1/sales/{test_sale.id}/contribute",
            json={
                "amount": "10",  # Below $100 minimum
                "tx_hash": make_tx_hash(),
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "BELOW_MINIMUM"


class TestClaimTokensEndpoint:
    """Tests for POST /api/v1/sales/{id}/claim."""

    async def test_claim_nothing_to_claim(
        self,
        client: AsyncClient,
        test_sale: TokenSale,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test claiming with no confirmed contributions."""
        access_token = auth_service.create_access_token(test_user.id)

        response = await client.post(
            f"/api/v1/sales/{test_sale.id}/claim",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        # Should fail because no confirmed contributions
        assert response.status_code == 404


class TestRefundEndpoint:
    """Tests for POST /api/v1/sales/{id}/refund."""

    async def test_refund_sale_not_failed(
        self,
        client: AsyncClient,
        test_sale: TokenSale,
        test_user: User,
        auth_service: CiretaAuthService,
    ) -> None:
        """Test refund on non-failed sale."""
        access_token = auth_service.create_access_token(test_user.id)

        response = await client.post(
            f"/api/v1/sales/{test_sale.id}/refund",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        # Should fail because sale is not in failed status
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "SALE_NOT_FAILED"
