"""Unit tests for ComplianceService."""

from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.services.compliance_service import ComplianceService


class TestComplianceServiceFreeze:
    """Tests for address freezing."""

    async def test_freeze_address_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful address freeze."""
        service = ComplianceService(db_session)
        address = "0x" + "d" * 40

        result = await service.freeze_address(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            address=address,
            reason="Suspicious activity",
        )

        assert result["address"] == address
        assert result["frozen"] is True

    async def test_freeze_address_token_not_found(
        self, db_session: AsyncSession, test_issuer_user: User
    ) -> None:
        """Test freeze fails for non-existent token."""
        service = ComplianceService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.freeze_address(
                user_id=test_issuer_user.id,
                token_id=uuid4(),
                address="0x" + "d" * 40,
                reason="Test",
            )

        assert exc_info.value.status_code == 404

    async def test_unfreeze_address_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful address unfreeze."""
        service = ComplianceService(db_session)
        address = "0x" + "e" * 40

        result = await service.unfreeze_address(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            address=address,
            reason="Cleared investigation",
        )

        assert result["address"] == address
        assert result["frozen"] is False


class TestComplianceServiceForcedTransfer:
    """Tests for forced transfers."""

    async def test_forced_transfer_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful forced transfer."""
        service = ComplianceService(db_session)

        result = await service.forced_transfer(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            from_address="0x" + "f" * 40,
            to_address="0x" + "1" * 40,
            amount="1000",
            reason="Court order",
        )

        assert result["from"] == "0x" + "f" * 40
        assert result["to"] == "0x" + "1" * 40
        assert result["amount"] == "1000"

    async def test_forced_transfer_not_authorized(
        self, db_session: AsyncSession, test_token: Token, test_user: User
    ) -> None:
        """Test forced transfer fails for non-issuer."""
        service = ComplianceService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.forced_transfer(
                user_id=test_user.id,
                token_id=test_token.id,
                from_address="0x" + "f" * 40,
                to_address="0x" + "1" * 40,
                amount="1000",
                reason="Test",
            )

        assert exc_info.value.status_code == 403


class TestComplianceServicePause:
    """Tests for token pausing."""

    async def test_pause_token_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful token pause."""
        service = ComplianceService(db_session)

        result = await service.pause_token(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            reason="Emergency maintenance",
        )

        assert result["paused"] is True

    async def test_unpause_token_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful token unpause."""
        service = ComplianceService(db_session)

        result = await service.unpause_token(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            reason="Maintenance complete",
        )

        assert result["paused"] is False


class TestComplianceServiceRecover:
    """Tests for token recovery."""

    async def test_recover_tokens_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful token recovery."""
        service = ComplianceService(db_session)

        result = await service.recover_tokens(
            user_id=test_issuer_user.id,
            token_id=test_token.id,
            from_address="0x" + "2" * 40,
            amount="500",
            reason="Lost private key recovery",
        )

        assert result["from"] == "0x" + "2" * 40
        assert result["amount"] == "500"
        assert result["recovered"] is True
