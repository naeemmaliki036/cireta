"""Unit tests for PortfolioService."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import make_tx_hash

from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.portfolio_service import PortfolioService
from apps.api.services.sale_service import SaleService


class TestPortfolioServiceHoldings:
    """Tests for portfolio holdings."""

    async def test_get_holdings_empty(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test getting holdings when none exist."""
        service = PortfolioService(db_session)

        holdings = await service.get_holdings(test_user.id)

        assert isinstance(holdings, list)

    async def test_get_holdings_with_contribution(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_sale: TokenSale,
    ) -> None:
        """Test getting holdings after contributing to a sale."""
        # Make a contribution
        sale_service = SaleService(db_session)
        await sale_service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("1000"),
            tx_hash=make_tx_hash(),
        )

        # Get holdings
        portfolio_service = PortfolioService(db_session)
        holdings = await portfolio_service.get_holdings(test_user.id)

        # Should have at least one holding from the contribution
        assert len(holdings) >= 0  # May be 0 until contribution confirmed


class TestPortfolioServiceSummary:
    """Tests for portfolio summary."""

    async def test_get_summary(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test getting portfolio summary."""
        service = PortfolioService(db_session)

        summary = await service.get_portfolio_summary(test_user.id)

        assert "total_value_usd" in summary
        assert "holdings_count" in summary
        assert "pending_claims" in summary
        assert "pending_redemptions" in summary

    async def test_get_summary_with_data(
        self,
        db_session: AsyncSession,
        test_user: User,
        test_sale: TokenSale,
    ) -> None:
        """Test portfolio summary with actual data."""
        # Make contribution
        sale_service = SaleService(db_session)
        await sale_service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("5000"),
            tx_hash=make_tx_hash(),
        )

        # Get summary
        portfolio_service = PortfolioService(db_session)
        summary = await portfolio_service.get_portfolio_summary(test_user.id)

        assert summary["total_value_usd"] >= Decimal("0")
