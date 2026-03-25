"""Unit tests for on-chain contribution recording (Task 1.4)."""

from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import make_tx_hash

from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.sale_service import SaleService


class TestContributionOnChain:
    """Tests for on-chain verified contribution recording."""

    @pytest.mark.asyncio
    async def test_contribute_dedup_raises_409(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Duplicate tx_hash raises 409 Conflict."""
        tx_hash = make_tx_hash()
        service = SaleService(db_session)

        # First contribution (mock on-chain verify to return None)
        with patch(
            "apps.api.services.sale_contribute_service.SaleContributeService._verify_on_chain",
            new_callable=AsyncMock,
            return_value=None,
        ), patch(
            "apps.api.services.sale_contribute_service.SaleContributeService._get_on_chain_cumulative",
            new_callable=AsyncMock,
            return_value=None,
        ):
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("1000"),
                tx_hash=tx_hash,
            )

        # Second call with same tx_hash should raise 409
        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("1000"),
                tx_hash=tx_hash,
            )
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_contribute_records_from_event_data(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Contribution data is sourced from on-chain event when available."""
        tx_hash = make_tx_hash()
        service = SaleService(db_session)
        event_amount = Decimal("2500")
        event_tokens = Decimal("2500")
        contributor = "0x" + "b" * 40

        mock_event_data = {
            "contributor": contributor,
            "phase_id": 0,
            "amount": event_amount,
            "tokens_allocated": event_tokens,
        }

        with patch(
            "apps.api.services.sale_contribute_service.SaleContributeService._verify_on_chain",
            new_callable=AsyncMock,
            return_value=mock_event_data,
        ), patch(
            "apps.api.services.sale_contribute_service.SaleContributeService._get_on_chain_cumulative",
            new_callable=AsyncMock,
            return_value=None,
        ):
            contrib = await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("999"),  # Different from event — should use event
                tx_hash=tx_hash,
            )

        # Data comes from event, not from request
        assert contrib.amount == event_amount
        assert contrib.tokens_allocated == event_tokens
        assert contrib.wallet_address == contributor

    @pytest.mark.asyncio
    async def test_contribute_kyc_required(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
    ) -> None:
        """Non-KYC user rejected."""
        # Create a user without KYC
        from apps.api.models.enums import KYCStatus, UserRole

        user = User()
        user.id = uuid4()
        user.email = f"nokyc_{uuid4().hex[:8]}@example.com"
        user.hashed_password = "$2b$12$test.hash"
        user.role = UserRole.INVESTOR
        user.kyc_status = KYCStatus.NONE
        user.kyc_level = 0
        db_session.add(user)
        await db_session.commit()

        service = SaleService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=user.id,
                sale_id=test_sale.id,
                amount=Decimal("1000"),
                tx_hash=make_tx_hash(),
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_contribute_below_minimum(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Amount below min_contribution rejected."""
        service = SaleService(db_session)
        with (
            patch(
                "apps.api.services.sale_contribute_service.SaleContributeService._verify_on_chain",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "apps.api.services.sale_contribute_service.SaleContributeService._get_on_chain_cumulative",
                new_callable=AsyncMock,
                return_value=None,
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await service.contribute(
                user_id=test_user.id,
                sale_id=test_sale.id,
                amount=Decimal("10"),  # Below min of 100
                tx_hash=make_tx_hash(),
            )
        assert "BELOW_MINIMUM" in str(exc_info.value.detail)
