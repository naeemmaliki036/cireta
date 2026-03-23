"""Unit tests for whitelist-only contribution path."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from tests.conftest import make_tx_hash

from apps.api.models.enums import SaleStatus
from apps.api.models.issuer import Issuer
from apps.api.models.sale_phase import SalePhase
from apps.api.models.sale_phase_whitelist import SalePhaseWhitelist
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from apps.api.services.sale_service import SaleService


@pytest.fixture
async def whitelist_sale(
    db_session: AsyncSession, test_token: Token, test_issuer: Issuer
) -> TokenSale:
    """Create a sale with a whitelist-only active phase."""
    sale = TokenSale()
    sale.id = uuid4()
    sale.token_id = test_token.id
    sale.issuer_id = test_issuer.id
    sale.payment_token = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    sale.soft_cap = Decimal("100000")
    sale.hard_cap = Decimal("500000")
    sale.status = SaleStatus.ACTIVE
    sale.total_raised = Decimal("0")

    db_session.add(sale)
    await db_session.flush()

    now = datetime.now(UTC)
    phase = SalePhase()
    phase.id = uuid4()
    phase.sale_id = sale.id
    phase.phase_number = 1
    phase.name = "Whitelist Only"
    phase.price_per_token = Decimal("1.00")
    phase.allocation = Decimal("100000")
    phase.min_contribution = Decimal("100")
    phase.max_contribution = Decimal("50000")
    phase.start_time = now - timedelta(days=1)
    phase.end_time = now + timedelta(days=30)
    phase.whitelist_only = True

    db_session.add(phase)
    await db_session.commit()

    # Eagerly load phases to avoid lazy-load outside async context
    result = await db_session.execute(
        select(TokenSale).options(selectinload(TokenSale.phases)).where(TokenSale.id == sale.id)
    )
    return result.scalar_one()


class TestWhitelistContribute:
    """Tests for whitelist-only phase contribution."""

    async def test_whitelisted_wallet_can_contribute(
        self,
        db_session: AsyncSession,
        whitelist_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Whitelisted wallet succeeds."""
        service = SaleService(db_session)

        # Create primary wallet for user
        addr = "0x" + "ab" * 20
        wallet = Wallet()
        wallet.id = uuid4()
        wallet.user_id = test_user.id
        wallet.address = addr
        wallet.address_checksum = addr
        wallet.is_primary = True
        wallet.chain_id = 8453
        db_session.add(wallet)

        # Add wallet to whitelist
        phase = whitelist_sale.phases[0]
        entry = SalePhaseWhitelist()
        entry.id = uuid4()
        entry.phase_id = phase.id
        entry.wallet_address = wallet.address.lower()
        db_session.add(entry)
        await db_session.commit()

        contribution = await service.contribute(
            user_id=test_user.id,
            sale_id=whitelist_sale.id,
            amount=Decimal("1000"),
            tx_hash=make_tx_hash(),
        )
        assert contribution.id is not None
        assert contribution.amount == Decimal("1000")

    async def test_non_whitelisted_wallet_rejected(
        self,
        db_session: AsyncSession,
        whitelist_sale: TokenSale,
        test_user: User,
    ) -> None:
        """Non-whitelisted wallet is rejected."""
        service = SaleService(db_session)

        addr = "0x" + "cd" * 20
        wallet = Wallet()
        wallet.id = uuid4()
        wallet.user_id = test_user.id
        wallet.address = addr
        wallet.address_checksum = addr
        wallet.is_primary = True
        wallet.chain_id = 8453
        db_session.add(wallet)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=whitelist_sale.id,
                amount=Decimal("1000"),
                tx_hash=make_tx_hash(),
            )
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "NOT_WHITELISTED"

    async def test_no_wallet_rejected(
        self,
        db_session: AsyncSession,
        whitelist_sale: TokenSale,
        test_user: User,
    ) -> None:
        """User with no wallet is rejected."""
        service = SaleService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.contribute(
                user_id=test_user.id,
                sale_id=whitelist_sale.id,
                amount=Decimal("1000"),
                tx_hash=make_tx_hash(),
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "NO_WALLET"
