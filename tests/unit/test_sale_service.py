"""Unit tests for SaleService."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import make_tx_hash

from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.sale_service import SaleService


class TestSaleServiceCreate:
    """Tests for sale creation."""

    async def test_create_sale_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful sale creation."""
        service = SaleService(db_session)
        now = datetime.now(UTC)

        phases = [
            {
                "name": "Phase 1",
                "price_per_token": Decimal("1.00"),
                "allocation": Decimal("100000"),
                "min_contribution": Decimal("100"),
                "max_contribution": Decimal("10000"),
                "start_time": now,
                "end_time": now + timedelta(days=30),
            }
        ]

        sale = await service.create_sale(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            payment_token="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            soft_cap=Decimal("50000"),
            hard_cap=Decimal("200000"),
            phases=phases,
        )

        assert sale.id is not None
        assert sale.token_id == test_token.id
        assert sale.soft_cap == Decimal("50000")
        assert sale.hard_cap == Decimal("200000")
        assert sale.status == "draft"

    async def test_create_sale_invalid_caps(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test sale creation fails when hard cap < soft cap."""
        service = SaleService(db_session)
        now = datetime.now(UTC)

        phases = [
            {
                "name": "Phase 1",
                "price_per_token": Decimal("1.00"),
                "allocation": Decimal("100000"),
                "start_time": now,
                "end_time": now + timedelta(days=30),
            }
        ]

        with pytest.raises(HTTPException) as exc_info:
            await service.create_sale(
                user_id=test_issuer_user.id,
                token_id=test_token.id,
                payment_token="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                soft_cap=Decimal("200000"),  # Soft cap > hard cap
                hard_cap=Decimal("100000"),
                phases=phases,
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "INVALID_CAPS"

    async def test_create_sale_not_authorized(
        self, db_session: AsyncSession, test_token: Token, test_user: User
    ) -> None:
        """Test sale creation fails for non-issuer."""
        service = SaleService(db_session)
        now = datetime.now(UTC)

        phases = [
            {
                "name": "Phase 1",
                "price_per_token": Decimal("1.00"),
                "allocation": Decimal("100000"),
                "start_time": now,
                "end_time": now + timedelta(days=30),
            }
        ]

        with pytest.raises(HTTPException) as exc_info:
            await service.create_sale(
                user_id=test_user.id,
                token_id=test_token.id,
                payment_token="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                soft_cap=Decimal("50000"),
                hard_cap=Decimal("200000"),
                phases=phases,
            )

        assert exc_info.value.status_code == 403


class TestSaleServiceContribute:
    """Tests for contributions."""

    async def test_contribute_success(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Test successful contribution."""
        service = SaleService(db_session)
        tx_hash = make_tx_hash()

        contribution = await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("1000"),
            tx_hash=tx_hash,
        )

        assert contribution.id is not None
        assert contribution.user_id == test_user.id
        assert contribution.sale_id == test_sale.id
        assert contribution.amount == Decimal("1000")
        assert contribution.tokens_allocated == Decimal("1000")  # 1:1 at $1
        assert contribution.status == "pending"

    async def test_contribute_sale_not_found(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test contribution to non-existent sale fails."""
        service = SaleService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=uuid4(),
                amount=Decimal("1000"),
                tx_hash=make_tx_hash(),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "SALE_NOT_FOUND"

    async def test_contribute_below_minimum(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Test contribution below minimum fails."""
        service = SaleService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("10"),  # Below $100 minimum
                tx_hash=make_tx_hash(),
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "BELOW_MINIMUM"

    async def test_contribute_above_maximum(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Test contribution above maximum fails."""
        service = SaleService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("100000"),  # Above $50000 maximum
                tx_hash=make_tx_hash(),
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "ABOVE_MAXIMUM"

    async def test_contribute_duplicate_tx(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Test duplicate transaction hash fails."""
        service = SaleService(db_session)
        tx_hash = make_tx_hash()

        # First contribution
        await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("1000"),
            tx_hash=tx_hash,
        )

        # Duplicate
        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("1000"),
                tx_hash=tx_hash,
            )

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["code"] == "TX_EXISTS"


class TestSaleServiceList:
    """Tests for listing sales."""

    async def test_list_sales(
        self, db_session: AsyncSession, test_sale: TokenSale
    ) -> None:
        """Test listing sales."""
        service = SaleService(db_session)

        sales, total = await service.list_sales(page=1, size=20)

        assert len(sales) >= 1
        assert total >= 1
        assert any(s.id == test_sale.id for s in sales)

    async def test_list_sales_with_filter(
        self, db_session: AsyncSession, test_sale: TokenSale
    ) -> None:
        """Test listing sales with status filter."""
        service = SaleService(db_session)
        from apps.api.models.enums import SaleStatus

        sales, total = await service.list_sales(
            page=1, size=20, status_filter=SaleStatus.ACTIVE
        )

        assert all(s.status == SaleStatus.ACTIVE for s in sales)


class TestSaleServiceGet:
    """Tests for getting a sale."""

    async def test_get_sale_success(
        self, db_session: AsyncSession, test_sale: TokenSale
    ) -> None:
        """Test getting a sale by ID."""
        service = SaleService(db_session)

        sale = await service.get_sale(test_sale.id)

        assert sale.id == test_sale.id
        assert sale.token_id == test_sale.token_id
        assert len(sale.phases) >= 1

    async def test_get_sale_not_found(self, db_session: AsyncSession) -> None:
        """Test getting non-existent sale fails."""
        service = SaleService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.get_sale(uuid4())

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "SALE_NOT_FOUND"
