"""Integration tests for endpoints added during the UI gap analysis sprint.

Covers:
- GET /api/v1/admin/sales/{sale_id}/buyers (per-sale aggregation w/ on-chain vs OTC)
- POST /api/v1/portfolio/redemptions/{request_id}/cancel (investor self-cancel)
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, FulfillmentMethod, RedemptionStatus
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.models.wallet import Wallet


# ───────────────────────── per-sale buyer view ─────────────────────────


def _make_contribution(
    *,
    user_id,
    sale_id,
    phase_id,
    wallet,
    amount: str,
    tokens: str,
    is_otc: bool,
) -> Contribution:
    c = Contribution()
    c.id = uuid4()
    c.user_id = user_id
    c.sale_id = sale_id
    c.phase_id = phase_id
    c.amount = Decimal(amount)
    c.payment_amount = Decimal("0") if is_otc else Decimal(amount)
    c.otc_amount = Decimal(amount) if is_otc else Decimal("0")
    c.tokens_allocated = Decimal(tokens)
    c.tx_hash = ("otc-" + uuid4().hex)[:66] if is_otc else ("0x" + uuid4().hex + uuid4().hex[:32])[:66]
    c.status = ContributionStatus.CONFIRMED
    c.is_otc = is_otc
    c.wallet_address = wallet
    c.phase_index = 0
    c.created_at = datetime.now(UTC)
    return c


class TestAdminSalesBuyers:
    async def test_returns_404_for_missing_sale(
        self,
        client: AsyncClient,
        admin_auth_headers: dict[str, str],
    ) -> None:
        r = await client.get(f"/api/v1/admin/sales/{uuid4()}/buyers", headers=admin_auth_headers)
        assert r.status_code == 404

    async def test_requires_admin_auth(
        self,
        client: AsyncClient,
        test_sale: TokenSale,
        auth_headers: dict[str, str],
    ) -> None:
        # investor token shouldn't access /admin/* routes
        r = await client.get(
            f"/api/v1/admin/sales/{test_sale.id}/buyers",
            headers=auth_headers,
        )
        assert r.status_code in (401, 403)

    async def test_aggregates_buyers_with_source_attribution(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_sale: TokenSale,
        test_user: User,
        admin_auth_headers: dict[str, str],
    ) -> None:
        # Resolve phase_id explicitly — lazy-loading on test_sale.phases isn't
        # available outside the request session.
        from sqlalchemy import select
        from apps.api.models.sale_phase import SalePhase
        res = await db_session.execute(select(SalePhase).where(SalePhase.sale_id == test_sale.id))
        phase = res.scalars().first()
        assert phase is not None
        phase_id = phase.id

        wallet_a = "0x" + "a" * 40
        wallet_b = "0x" + "b" * 40

        # Same wallet, two on-chain buys
        db_session.add(_make_contribution(
            user_id=test_user.id, sale_id=test_sale.id, phase_id=phase_id,
            wallet=wallet_a, amount="100", tokens="100", is_otc=False,
        ))
        db_session.add(_make_contribution(
            user_id=test_user.id, sale_id=test_sale.id, phase_id=phase_id,
            wallet=wallet_a, amount="50", tokens="50", is_otc=False,
        ))
        # Same wallet OTC — should bucket separately as is_otc=true
        db_session.add(_make_contribution(
            user_id=test_user.id, sale_id=test_sale.id, phase_id=phase_id,
            wallet=wallet_a, amount="200", tokens="200", is_otc=True,
        ))
        # Different wallet OTC
        db_session.add(_make_contribution(
            user_id=test_user.id, sale_id=test_sale.id, phase_id=phase_id,
            wallet=wallet_b, amount="500", tokens="500", is_otc=True,
        ))
        await db_session.commit()

        r = await client.get(
            f"/api/v1/admin/sales/{test_sale.id}/buyers",
            headers=admin_auth_headers,
        )
        assert r.status_code == 200, r.text
        rows = r.json()

        # Expect 3 buckets: (wallet_a, on-chain), (wallet_a, OTC), (wallet_b, OTC)
        assert len(rows) == 3

        on_chain = [r for r in rows if r["wallet_address"].lower() == wallet_a and not r["is_otc"]]
        assert len(on_chain) == 1
        assert float(on_chain[0]["total_usdc_contributed"]) == 150.0
        assert on_chain[0]["contribution_count"] == 2
        assert on_chain[0]["fractions_delivered"] is True  # on-chain auto-true

        otc_a = [r for r in rows if r["wallet_address"].lower() == wallet_a and r["is_otc"]]
        assert len(otc_a) == 1
        assert otc_a[0]["fractions_delivered"] is False  # no OtcTransferLog row

        otc_b = [r for r in rows if r["wallet_address"].lower() == wallet_b and r["is_otc"]]
        assert len(otc_b) == 1
        assert float(otc_b[0]["total_usdc_contributed"]) == 500.0


# ───────────────────────── investor redemption cancel ─────────────────────────


def _make_redemption(*, user_id, token_id, status=RedemptionStatus.PENDING) -> RedemptionRequest:
    r = RedemptionRequest()
    r.id = uuid4()
    r.user_id = user_id
    r.token_id = token_id
    r.amount = Decimal("10")
    r.fulfillment_method = FulfillmentMethod.CASH
    r.status = status
    return r


class TestRedemptionCancel:
    async def test_owner_can_cancel_pending(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_token: Token,
        auth_headers: dict[str, str],
    ) -> None:
        red = _make_redemption(user_id=test_user.id, token_id=test_token.id)
        db_session.add(red)
        await db_session.commit()
        await db_session.refresh(red)

        r = await client.post(
            f"/api/v1/portfolio/redemptions/{red.id}/cancel",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "cancelled"

    async def test_non_owner_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,  # different user
        auth_headers: dict[str, str],  # auth as test_user
    ) -> None:
        # Redemption owned by issuer_user, not test_user
        red = _make_redemption(user_id=test_issuer_user.id, token_id=test_token.id)
        db_session.add(red)
        await db_session.commit()
        await db_session.refresh(red)

        r = await client.post(
            f"/api/v1/portfolio/redemptions/{red.id}/cancel",
            headers=auth_headers,
        )
        assert r.status_code == 403
        assert r.json()["detail"]["code"] == "NOT_OWNER"

    async def test_cannot_cancel_non_pending(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_token: Token,
        auth_headers: dict[str, str],
    ) -> None:
        red = _make_redemption(
            user_id=test_user.id,
            token_id=test_token.id,
            status=RedemptionStatus.PROCESSING,
        )
        db_session.add(red)
        await db_session.commit()
        await db_session.refresh(red)

        r = await client.post(
            f"/api/v1/portfolio/redemptions/{red.id}/cancel",
            headers=auth_headers,
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "NOT_CANCELLABLE"

    async def test_returns_404_for_missing(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        r = await client.post(
            f"/api/v1/portfolio/redemptions/{uuid4()}/cancel",
            headers=auth_headers,
        )
        assert r.status_code == 404
