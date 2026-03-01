"""Unit tests for IssuerService."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from apps.api.models.user import User
from apps.api.services.issuer_service import IssuerService


class TestIssuerServiceOnboard:
    """Tests for issuer onboarding."""

    async def test_onboard_issuer_success(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test successful issuer onboarding."""
        service = IssuerService(db_session)

        issuer = await service.onboard_issuer(
            user_id=test_user.id,
            name="New Issuer Corp",
            slug="new-issuer-corp",
            wallet_address="0x" + "c" * 40,
            legal_entity_name="New Issuer Corp LLC",
            jurisdiction="US",
        )

        assert issuer.id is not None
        assert issuer.user_id == test_user.id
        assert issuer.name == "New Issuer Corp"
        assert issuer.slug is not None
        assert issuer.status == "pending"

    async def test_onboard_issuer_user_not_found(
        self, db_session: AsyncSession
    ) -> None:
        """Test onboarding fails for non-existent user."""
        service = IssuerService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.onboard_issuer(
                user_id=uuid4(),
                name="Test Issuer",
                slug="test-issuer",
                wallet_address="0x" + "c" * 40,
                legal_entity_name="Test LLC",
                jurisdiction="US",
            )

        assert exc_info.value.status_code == 404


class TestIssuerServiceList:
    """Tests for listing issuers."""

    async def test_list_issuers(
        self, db_session: AsyncSession, test_issuer: Issuer
    ) -> None:
        """Test listing issuers."""
        service = IssuerService(db_session)

        issuers, total = await service.list_issuers(page=1, size=20)

        assert len(issuers) >= 1
        assert total >= 1
        assert any(i.id == test_issuer.id for i in issuers)

    async def test_list_issuers_pagination(
        self, db_session: AsyncSession, test_issuer: Issuer
    ) -> None:
        """Test issuer pagination."""
        service = IssuerService(db_session)

        issuers, total = await service.list_issuers(page=1, size=1)

        assert len(issuers) <= 1


class TestIssuerServiceFee:
    """Tests for fee management."""

    async def test_set_fee_success(
        self,
        db_session: AsyncSession,
        test_issuer: Issuer,
        test_admin_user: User,
    ) -> None:
        """Test setting issuer fee."""
        service = IssuerService(db_session)

        issuer = await service.set_fee(
            issuer_id=test_issuer.id,
            fee_bps=300,
        )

        assert issuer.fee_bps == 300

    async def test_set_fee_issuer_not_found(
        self, db_session: AsyncSession
    ) -> None:
        """Test setting fee for non-existent issuer fails."""
        service = IssuerService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.set_fee(issuer_id=uuid4(), fee_bps=300)

        assert exc_info.value.status_code == 404

    async def test_set_fee_invalid_range(
        self, db_session: AsyncSession, test_issuer: Issuer
    ) -> None:
        """Test setting fee outside valid range fails."""
        service = IssuerService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.set_fee(issuer_id=test_issuer.id, fee_bps=15000)

        assert exc_info.value.status_code == 400


class TestIssuerServiceRevoke:
    """Tests for issuer revocation."""

    async def test_revoke_issuer_success(
        self, db_session: AsyncSession, test_issuer: Issuer
    ) -> None:
        """Test revoking issuer."""
        service = IssuerService(db_session)

        issuer = await service.revoke_issuer(test_issuer.id)

        assert issuer.status == "suspended"

    async def test_revoke_issuer_not_found(
        self, db_session: AsyncSession
    ) -> None:
        """Test revoking non-existent issuer fails."""
        service = IssuerService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.revoke_issuer(uuid4())

        assert exc_info.value.status_code == 404
