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

    async def test_contribute_duplicate_tx_returns_409(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Duplicate tx_hash raises 409 Conflict."""
        service = SaleService(db_session)
        tx_hash = make_tx_hash()

        # First contribution
        await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("1000"),
            tx_hash=tx_hash,
        )

        # Duplicate — should raise 409
        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("1000"),
                tx_hash=tx_hash,
            )
        assert exc_info.value.status_code == 409


class TestLastChunkException:
    """Tests for the last-chunk exception — buy remaining tokens below minimum."""

    async def test_last_chunk_new_investor_below_min_allowed(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """New investor can buy exactly the remaining tokens even if below min."""
        service = SaleService(db_session)

        # Set total_token_supply and simulate most tokens already sold.
        # Phase has min_contribution=100 (price=1.00, so min 100 tokens).
        # We'll set supply to 103 and pre-sell 100, leaving 3.
        test_sale.total_token_supply = Decimal("103")
        await db_session.commit()

        # Create a second user to pre-sell 100 tokens
        from apps.api.models.enums import KYCStatus
        from apps.api.models.user import User as UserModel

        bulk_buyer = UserModel()
        bulk_buyer.id = uuid4()
        bulk_buyer.email = "bulk@test.com"
        bulk_buyer.hashed_password = "hashed"
        bulk_buyer.kyc_level = 2
        bulk_buyer.kyc_status = KYCStatus.APPROVED
        db_session.add(bulk_buyer)
        await db_session.commit()

        await service.contribute(
            user_id=bulk_buyer.id,
            sale_id=test_sale.id,
            amount=Decimal("100"),
            tx_hash=make_tx_hash(),
        )

        # Now test_user tries to buy 3 tokens ($3) — below $100 min.
        # Should succeed because it's exactly the remaining supply.
        contribution = await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("3"),
            tx_hash=make_tx_hash(),
        )
        assert contribution.amount == Decimal("3")

    async def test_last_chunk_repeat_buyer_below_topup_min_allowed(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Repeat buyer can top up with remaining tokens even if below top_up_min."""
        service = SaleService(db_session)

        # Set supply to 203, phase top_up_min=1000 (default).
        # First buy 200 tokens, leaving 3 remaining.
        test_sale.total_token_supply = Decimal("203")
        await db_session.commit()

        # First buy — meets min_contribution ($100 min, buying $200)
        await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("200"),
            tx_hash=make_tx_hash(),
        )

        # Top-up: $3 — below top_up_min, but it's the last 3 tokens
        contribution = await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("3"),
            tx_hash=make_tx_hash(),
        )
        assert contribution.amount == Decimal("3")

    async def test_non_last_chunk_below_min_still_rejected(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Below-min buy when plenty of tokens remain is still rejected."""
        service = SaleService(db_session)

        test_sale.total_token_supply = Decimal("100000")
        await db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("10"),  # Below $100 min, 100k tokens remain
                tx_hash=make_tx_hash(),
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "BELOW_MINIMUM"

    async def test_repeat_buyer_below_topup_min_not_last_chunk_rejected(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Repeat buyer below top_up_min with plenty remaining is rejected."""
        service = SaleService(db_session)

        test_sale.total_token_supply = Decimal("100000")
        await db_session.commit()

        # First buy
        await service.contribute(
            user_id=test_user.id,
            sale_id=test_sale.id,
            amount=Decimal("1000"),
            tx_hash=make_tx_hash(),
        )

        # Top-up below top_up_min with plenty of tokens left
        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("5"),
                tx_hash=make_tx_hash(),
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "TOP_UP_BELOW_MIN"


class TestSaleServiceList:
    """Tests for listing sales."""

    async def test_list_sales(self, db_session: AsyncSession, test_sale: TokenSale) -> None:
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

        sales, total = await service.list_sales(page=1, size=20, status_filter=SaleStatus.ACTIVE)

        assert all(s.status == SaleStatus.ACTIVE for s in sales)


class TestSaleServiceGet:
    """Tests for getting a sale."""

    async def test_get_sale_success(self, db_session: AsyncSession, test_sale: TokenSale) -> None:
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
