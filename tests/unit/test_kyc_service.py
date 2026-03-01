"""Unit tests for KYCService."""

import hashlib
import hmac
import json
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User
from apps.api.services.kyc_service import KYCService


class TestKYCServiceInitiate:
    """Tests for KYC initiation."""

    async def test_initiate_kyc_success(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
        """Test successful KYC initiation."""
        service = KYCService(db_session)

        result = await service.initiate(test_user.id)

        assert "applicant_id" in result
        assert "sdk_token" in result

    async def test_initiate_kyc_user_not_found(
        self, db_session: AsyncSession
    ) -> None:
        """Test KYC initiation for non-existent user fails."""
        service = KYCService(db_session)

        with pytest.raises(HTTPException) as exc_info:
            await service.initiate(uuid4())

        assert exc_info.value.status_code == 404


class TestKYCServiceStatus:
    """Tests for KYC status."""

    async def test_get_status(
        self, db_session: AsyncSession, test_user: User
    ) -> None:
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

        service = KYCService.__new__(KYCService)  # Skip __init__
        result = service._validate_sumsub_signature(body, expected_sig, secret)

        assert result is True

    def test_validate_signature_failure(self) -> None:
        """Test webhook signature validation fails with wrong signature."""
        secret = "test-secret"
        body = b'{"type": "applicantReviewed"}'
        wrong_sig = "wrong-signature"

        service = KYCService.__new__(KYCService)
        result = service._validate_sumsub_signature(body, wrong_sig, secret)

        assert result is False

    async def test_handle_webhook_invalid_signature(
        self, db_session: AsyncSession
    ) -> None:
        """Test webhook handling fails with invalid signature."""
        service = KYCService(db_session)
        body = b'{"type": "applicantReviewed"}'

        with pytest.raises(HTTPException) as exc_info:
            await service.handle_webhook(body, "invalid-signature")

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_SIGNATURE"
