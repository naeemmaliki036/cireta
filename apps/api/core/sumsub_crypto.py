"""Sumsub cryptographic helpers — HMAC-SHA256 webhook signature verification."""

import hashlib
import hmac


def validate_sumsub_signature(body: bytes, sig_header: str, secret: str) -> bool:
    """Validate Sumsub webhook HMAC-SHA256 signature.

    CRITICAL: Must be called BEFORE any webhook processing.

    Args:
        body: Raw request body bytes.
        sig_header: X-Payload-Digest header value from Sumsub.
        secret: Sumsub secret key from settings.

    Returns:
        True if signature valid, False otherwise (or if secret is empty).
    """
    if not secret:
        return False  # Reject all without secret in production
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_header)
