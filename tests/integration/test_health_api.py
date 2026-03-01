"""Integration tests for health API endpoints."""

from httpx import AsyncClient


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    async def test_liveness_check(self, client: AsyncClient) -> None:
        """Test liveness endpoint."""
        response = await client.get("/api/v1/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    async def test_readiness_check(self, client: AsyncClient) -> None:
        """Test readiness endpoint."""
        response = await client.get("/api/v1/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "details" in data
        assert "database" in data["details"]
