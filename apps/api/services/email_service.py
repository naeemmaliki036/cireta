"""Email service using Resend API for transactional emails."""

from __future__ import annotations

import logging

import resend

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Templates base URL
_BASE_URL = settings.frontend_url if hasattr(settings, "frontend_url") else "https://cireta.com"


def _get_client() -> bool:
    """Configure Resend client. Returns True if ready, handles dev fallback.

    In production/staging: raises RuntimeError if RESEND_API_KEY not set.
    In development: logs warning and returns False (skip send).
    """
    if not settings.resend_api_key:
        if settings.environment != "development":
            raise RuntimeError(
                "RESEND_API_KEY not configured — email sending unavailable. "
                "Set RESEND_API_KEY env var."
            )
        logger.warning(
            "RESEND_API_KEY not set in development — skipping email send"
        )
        return False
    resend.api_key = settings.resend_api_key
    return True


async def send_email_verify(to: str, token: str) -> bool:
    """Send email verification link."""
    if not _get_client():
        return False
    verify_url = f"{_BASE_URL}/verify-email?token={token}"
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": "Verify your Cireta account",
                "html": f"""
            <h2>Welcome to Cireta</h2>
            <p>Click the link below to verify your email address:</p>
            <p><a href="{verify_url}">Verify Email</a></p>
            <p>This link expires in 24 hours.</p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send verify email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_password_reset(to: str, token: str) -> bool:
    """Send password reset link."""
    if not _get_client():
        return False
    reset_url = f"{_BASE_URL}/reset-password?token={token}"
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": "Reset your Cireta password",
                "html": f"""
            <h2>Password Reset</h2>
            <p>Click the link below to reset your password:</p>
            <p><a href="{reset_url}">Reset Password</a></p>
            <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send reset email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_kyc_approved(to: str, kyc_level: int) -> bool:
    """Send KYC approval notification."""
    if not _get_client():
        return False
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": "KYC Verification Approved",
                "html": f"""
            <h2>You are verified!</h2>
            <p>Your KYC verification (Level {kyc_level}) has been approved.</p>
            <p>You can now invest in tokenized real-world assets on Cireta.</p>
            <p><a href="{_BASE_URL}/explore">Browse Projects</a></p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send KYC approved email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_kyc_rejected(to: str, reason: str = "") -> bool:
    """Send KYC rejection notification."""
    if not _get_client():
        return False
    reason_text = f"<p>Reason: {reason}</p>" if reason else ""
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": "KYC Verification Update",
                "html": f"""
            <h2>Verification Not Approved</h2>
            <p>Unfortunately your KYC verification was not approved.</p>
            {reason_text}
            <p><a href="{_BASE_URL}/settings/verification">Try Again</a></p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send KYC rejected email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_investment_confirmed(to: str, amount: str, token_symbol: str, tx_hash: str) -> bool:
    """Send investment confirmation."""
    if not _get_client():
        return False
    tx_url = f"https://basescan.org/tx/{tx_hash}"
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": f"Investment Confirmed — {token_symbol}",
                "html": f"""
            <h2>Investment Confirmed</h2>
            <p>Your investment of <strong>{amount} USDC</strong> in <strong>{token_symbol}</strong> has been confirmed.</p>
            <p><a href="{tx_url}">View Transaction</a></p>
            <p>Tokens will be available to claim once the sale finalizes.</p>
            <p><a href="{_BASE_URL}/portfolio">View Portfolio</a></p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send investment confirmed email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_sale_finalized(to: str, token_symbol: str, success: bool) -> bool:
    """Send sale finalization notification."""
    if not _get_client():
        return False
    if success:
        subject = f"Sale Finalized — {token_symbol} tokens available to claim"
        body = f"""
        <h2>Sale Successfully Finalized</h2>
        <p>The <strong>{token_symbol}</strong> token sale has finalized successfully.</p>
        <p>Your tokens are now available to claim.</p>
        <p><a href="{_BASE_URL}/portfolio">Claim Tokens</a></p>
        """
    else:
        subject = f"Sale Failed — {token_symbol} refund available"
        body = f"""
        <h2>Sale Did Not Meet Soft Cap</h2>
        <p>The <strong>{token_symbol}</strong> token sale did not reach its minimum funding goal.</p>
        <p>Your full USDC contribution is available to claim as a refund.</p>
        <p><a href="{_BASE_URL}/portfolio">Claim Refund</a></p>
        """
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": subject,
                "html": body,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send sale finalized email: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_kyc_expiry_warning(to: str, days_left: int) -> bool:
    """Send KYC expiry warning email."""
    if not _get_client():
        return False
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": "KYC Verification Expiring Soon",
                "html": f"""
            <h2>Your KYC Verification is Expiring</h2>
            <p>Your KYC verification will expire in <strong>{days_left} days</strong>.</p>
            <p>To continue investing on Cireta, please re-verify your identity before it expires.</p>
            <p><a href="{_BASE_URL}/settings/verification">Re-verify Now</a></p>
            <p>If your KYC expires, you will be unable to make new investments until re-verified.</p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send KYC expiry warning: %s", e)
        if settings.environment != "development":
            raise
        return False


async def send_redemption_fulfilled(to: str, token_symbol: str) -> bool:
    """Send redemption fulfillment notification."""
    if not _get_client():
        return False
    try:
        resend.Emails.send(
            {
                "from": "Cireta <noreply@cireta.com>",
                "to": [to],
                "subject": f"Redemption Fulfilled — {token_symbol}",
                "html": f"""
            <h2>Your Redemption Has Been Fulfilled</h2>
            <p>Your <strong>{token_symbol}</strong> commodity redemption has been fulfilled.</p>
            <p>Your physical asset is on its way. Check your portfolio for details.</p>
            <p><a href="{_BASE_URL}/portfolio">View Portfolio</a></p>
            """,
            }
        )
        return True
    except Exception as e:
        logger.error("Failed to send redemption fulfilled email: %s", e)
        if settings.environment != "development":
            raise
        return False
