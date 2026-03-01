"""Unit tests for ComplianceService."""


import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.audit_log import AuditLog
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
        """Test successful address freeze creates audit log."""
        service = ComplianceService(db_session)
        address = "0x" + "d" * 40

        result = await service.freeze_address(
            actor_id=test_issuer_user.id,
            wallet_address=address,
            token_id=test_token.id,
            reason="Suspicious activity",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "freeze"
        assert result.target_id == address

    async def test_freeze_address_no_token(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test freeze with None token_id still logs."""
        service = ComplianceService(db_session)

        result = await service.freeze_address(
            actor_id=test_issuer_user.id,
            wallet_address="0x" + "d" * 40,
            token_id=None,
            reason="Test",
        )
        assert isinstance(result, AuditLog)

    async def test_unfreeze_address_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful address unfreeze creates audit log."""
        service = ComplianceService(db_session)
        address = "0x" + "e" * 40

        result = await service.unfreeze_address(
            actor_id=test_issuer_user.id,
            wallet_address=address,
            token_id=test_token.id,
            reason="Cleared investigation",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "unfreeze"
        assert result.target_id == address


class TestComplianceServiceForcedTransfer:
    """Tests for forced transfers."""

    async def test_forced_transfer_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful forced transfer creates audit log."""
        service = ComplianceService(db_session)

        result = await service.forced_transfer(
            actor_id=test_issuer_user.id,
            token_id=test_token.id,
            from_address="0x" + "f" * 40,
            to_address="0x" + "1" * 40,
            amount="1000",
            reason="Court order",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "forced_transfer"

    async def test_forced_transfer_not_authorized(
        self, db_session: AsyncSession, test_token: Token, test_user: User
    ) -> None:
        """Test forced transfer fails for non-issuer."""
        service = ComplianceService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.forced_transfer(
                actor_id=test_user.id,
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
        """Test successful token pause creates audit log."""
        service = ComplianceService(db_session)

        result = await service.pause_token(
            actor_id=test_issuer_user.id,
            token_id=test_token.id,
            reason="Emergency maintenance",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "pause_token"

    async def test_unpause_token_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful token unpause creates audit log."""
        service = ComplianceService(db_session)

        result = await service.unpause_token(
            actor_id=test_issuer_user.id,
            token_id=test_token.id,
            reason="Maintenance complete",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "unpause_token"


class TestComplianceServiceRecover:
    """Tests for token recovery."""

    async def test_recover_tokens_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful token recovery creates audit log."""
        service = ComplianceService(db_session)

        result = await service.recover_tokens(
            actor_id=test_issuer_user.id,
            token_id=test_token.id,
            from_address="0x" + "2" * 40,
            to_address="0x" + "3" * 40,
            amount="500",
            reason="Lost private key recovery",
        )

        assert isinstance(result, AuditLog)
        assert result.action == "recover_tokens"
