"""Unit tests for KYCService."""

import hashlib
import hmac
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.core.sumsub_crypto import validate_sumsub_signature
from apps.api.models.user import User
from apps.api.services.kyc_service import KYCService


class TestKYCServiceInitiate:
    """Tests for KYC initiation."""

    async def test_initiate_kyc_success(self, db_session: AsyncSession) -> None:
        """Test successful KYC initiation with a fresh unverified user."""
        from apps.api.models.enums import KYCStatus, UserRole

        # Create a fresh user with no KYC
        user = User()
        user.id = uuid4()
        user.email = f"kyc_test_{uuid4().hex[:6]}@example.com"
        user.hashed_password = "$2b$12$test.hash"
        user.role = UserRole.INVESTOR
        user.kyc_status = KYCStatus.NONE
        user.kyc_level = 0
        db_session.add(user)
        await db_session.commit()

        service = KYCService(db_session)
        result = await service.initiate(user.id)

        assert "applicant_id" in result
        assert "access_token" in result

    async def test_initiate_kyc_user_not_found(self, db_session: AsyncSession) -> None:
        """Test KYC initiation for non-existent user fails."""
        service = KYCService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.initiate(uuid4())

        assert exc_info.value.status_code == 404


class TestKYCServiceStatus:
    """Tests for KYC status."""

    async def test_get_status(self, db_session: AsyncSession, test_user: User) -> None:
        """Test getting KYC status."""
        service = KYCService(db_session)

        status = await service.get_status(test_user.id)

        assert "status" in status
        assert "level" in status


class TestKYCServiceWebhook:
    """Tests for Sumsub webhook handling."""

    def test_validate_signature_success(self) -> None:
        """Test webhook signature validation."""
        secret = "test-secret"
        body = b'{"type": "applicantReviewed"}'
        expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        result = validate_sumsub_signature(body, expected_sig, secret)

        assert result is True

    def test_validate_signature_failure(self) -> None:
        """Test webhook signature validation fails with wrong signature."""
        secret = "test-secret"
        body = b'{"type": "applicantReviewed"}'
        wrong_sig = "wrong-signature"

        result = validate_sumsub_signature(body, wrong_sig, secret)

        assert result is False

    async def test_handle_webhook_unknown_type(self, db_session: AsyncSession) -> None:
        """Test webhook handling with unknown type does nothing (no error)."""
        service = KYCService(db_session)
        # Service handle_webhook takes a pre-validated payload dict
        payload = {"type": "unknown_event", "applicantId": "test-id"}
        # Should not raise for unknown event types
        await service.handle_webhook(payload)
