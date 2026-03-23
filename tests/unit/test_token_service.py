"""Unit tests for TokenService."""

from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.issuer import Issuer
from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.services.token_service import TokenService


class TestTokenServiceCreate:
    """Tests for token creation."""

    async def test_create_token_success(
        self,
        db_session: AsyncSession,
        test_issuer: Issuer,
        test_issuer_user: User,
    ) -> None:
        """Test successful token creation."""
        service = TokenService(db_session)

        token = await service.create_token(
            user_id=test_issuer_user.id,
            name="Gold Reserve Token",
            symbol=f"GRT{uuid4().hex[:4].upper()}",
            asset_type="commodity",
            total_supply=Decimal("1000000"),
            decimals=18,
            ipfs_docs_hash="QmTest123",
            chainlink_por_feed="0x" + "b" * 40,
        )

        assert token.id is not None
        assert token.name == "Gold Reserve Token"
        assert token.issuer_id == test_issuer.id
        assert token.total_supply == Decimal("1000000")
        assert token.decimals == 18
        assert token.ipfs_docs_hash == "QmTest123"

    async def test_create_token_not_issuer(self, db_session: AsyncSession, test_user: User) -> None:
        """Test token creation fails for non-issuers."""
        service = TokenService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_token(
                user_id=test_user.id,
                name="Test Token",
                symbol="TEST",
                asset_type="commodity",
                total_supply=Decimal("100000"),
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "NOT_ISSUER"

    async def test_create_token_duplicate_symbol(
        self,
        db_session: AsyncSession,
        test_issuer: Issuer,
        test_issuer_user: User,
        test_token: Token,
    ) -> None:
        """Test token creation fails for duplicate symbol."""
        service = TokenService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.create_token(
                user_id=test_issuer_user.id,
                name="Another Token",
                symbol=test_token.symbol,
                asset_type="commodity",
                total_supply=Decimal("100000"),
            )

        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["code"] == "SYMBOL_EXISTS"


class TestTokenServiceDeploy:
    """Tests for token deployment."""

    async def test_deploy_contract_success(
        self,
        db_session: AsyncSession,
        test_token: Token,
        test_issuer_user: User,
    ) -> None:
        """Test successful contract deployment."""
        service = TokenService(db_session)
        mock_address = "0x" + "a1" * 20
        mock_receipt = {"transactionHash": b"\x00" * 32}

        with patch(
            "apps.api.services.web3_token_service.Web3TokenService"
        ) as mock_cls:
            mock_svc = mock_cls.return_value
            mock_svc.deploy_erc3643_token = AsyncMock(
                return_value=(mock_address, mock_receipt)
            )
            mock_svc.deployer_address = mock_address

            token = await service.deploy_contract(
                user_id=test_issuer_user.id,
                token_id=test_token.id,
            )

        assert token.contract_address is not None
        assert token.is_deployed is True

    async def test_deploy_contract_not_found(
        self, db_session: AsyncSession, test_issuer_user: User
    ) -> None:
        """Test deployment fails for non-existent token."""
        service = TokenService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.deploy_contract(
                user_id=test_issuer_user.id,
                token_id=uuid4(),
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "TOKEN_NOT_FOUND"

    async def test_deploy_contract_not_authorized(
        self, db_session: AsyncSession, test_token: Token, test_user: User
    ) -> None:
        """Test deployment fails for unauthorized user."""
        service = TokenService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.deploy_contract(
                user_id=test_user.id,
                token_id=test_token.id,
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "NOT_AUTHORIZED"


class TestTokenServiceList:
    """Tests for listing tokens."""

    async def test_list_tokens(self, db_session: AsyncSession, test_token: Token) -> None:
        """Test listing tokens."""
        service = TokenService(db_session)

        tokens, total = await service.list_tokens(page=1, size=20)

        assert len(tokens) >= 1
        assert total >= 1
        assert any(t.id == test_token.id for t in tokens)

    async def test_list_tokens_pagination(
        self, db_session: AsyncSession, test_token: Token
    ) -> None:
        """Test token pagination."""
        service = TokenService(db_session)

        tokens, total = await service.list_tokens(page=1, size=1)

        assert len(tokens) <= 1
        assert total >= 1

    async def test_list_tokens_by_issuer(
        self, db_session: AsyncSession, test_token: Token, test_issuer: Issuer
    ) -> None:
        """Test listing tokens filtered by issuer."""
        service = TokenService(db_session)

        tokens, total = await service.list_tokens(page=1, size=20, issuer_id=test_issuer.id)

        assert len(tokens) >= 1
        assert all(t.issuer_id == test_issuer.id for t in tokens)


class TestTokenServiceGet:
    """Tests for getting a token."""

    async def test_get_token_success(self, db_session: AsyncSession, test_token: Token) -> None:
        """Test getting a token by ID."""
        service = TokenService(db_session)

        token = await service.get_token(test_token.id)

        assert token.id == test_token.id
        assert token.name == test_token.name
        assert token.symbol == test_token.symbol

    async def test_get_token_not_found(self, db_session: AsyncSession) -> None:
        """Test getting non-existent token fails."""
        service = TokenService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.get_token(uuid4())

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "TOKEN_NOT_FOUND"
