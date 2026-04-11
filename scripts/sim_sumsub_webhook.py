"""Simulate a Sumsub webhook callback for end-to-end KYC approval testing.

Builds a Sumsub-shaped ``applicantReviewed`` payload, signs it with
HMAC-SHA256 using the same ``SUMSUB_SECRET_KEY`` the API validates
against, and POSTs it to ``/api/v1/kyc/webhook``. Lets you exercise the
full webhook code path (signature validation, ``webhook_events`` row,
``KYCService.handle_webhook`` parser, ``_issue_onchain_claims`` →
identity sync queue) without depending on a real Sumsub callback.

Usage:

    # Option A — point at the user via their email (externalUserId)
    SUMSUB_SECRET_KEY=any-shared-secret \\
    SUMSUB_APP_TOKEN=any-shared-token \\
        poetry run python scripts/sim_sumsub_webhook.py \\
            --api https://api-keeta.up.railway.app \\
            --user-email buyer@example.com \\
            --answer GREEN

    # Option B — point at the user via their Sumsub applicantId
    poetry run python scripts/sim_sumsub_webhook.py \\
            --applicant-id 6123456789abcdef01234567 \\
            --answer GREEN

Decisions:
- Default ``--answer`` is GREEN (KYC approved).
- ``--answer RED`` simulates a rejection so you can test the rejection
  branch + ``user.kyc_status = rejected`` flow.
- HMAC algorithm + header names match the production handler in
  ``apps/api/api/v1/endpoints/kyc.py``: ``X-Payload-Digest`` (lower-hex
  of ``HMAC-SHA256(body, secret)``) and ``X-App-Token``.
- Must run while the target API server has ``SUMSUB_SECRET_KEY`` and
  ``SUMSUB_APP_TOKEN`` env vars set to the SAME values you pass here.
  For dev / staging, just pick any random strings and set them on
  both sides — they don't have to be real Sumsub credentials.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from typing import Any

import requests


def build_payload(
    applicant_id: str,
    external_user_id: str | None,
    answer: str,
    review_status: str,
) -> dict[str, Any]:
    """Build a Sumsub-shaped ``applicantReviewed`` event payload."""
    return {
        "applicantId": applicant_id,
        "inspectionId": uuid.uuid4().hex,
        "correlationId": uuid.uuid4().hex,
        "externalUserId": external_user_id or applicant_id,
        "type": "applicantReviewed",
        "reviewStatus": review_status,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S+0000", time.gmtime()),
        "createdAtMs": str(int(time.time() * 1000)),
        "clientId": "cireta-dev-sim",
        "reviewResult": {
            "reviewAnswer": answer,
            "rejectLabels": [] if answer == "GREEN" else ["DOCUMENT_PAGE_MISSING"],
            "reviewRejectType": None if answer == "GREEN" else "RETRY",
        },
        "applicantType": "individual",
    }


def sign(body: bytes, secret: str) -> str:
    """HMAC-SHA256 signature, lower-hex, matching the API verifier."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--api",
        default=os.environ.get("CIRETA_API_URL", "http://localhost:8000"),
        help="API host (default: $CIRETA_API_URL or http://localhost:8000)",
    )
    parser.add_argument(
        "--applicant-id",
        default=None,
        help="Sumsub applicantId (matches user.sumsub_applicant_id in DB). Required if --user-email not given.",
    )
    parser.add_argument(
        "--user-email",
        default=None,
        help="User email — used as externalUserId. Required if --applicant-id not given.",
    )
    parser.add_argument(
        "--answer",
        choices=["GREEN", "RED"],
        default="GREEN",
        help="reviewResult.reviewAnswer (default: GREEN = KYC approved)",
    )
    parser.add_argument(
        "--review-status",
        default="completed",
        help="reviewStatus value (default: completed)",
    )
    parser.add_argument(
        "--secret",
        default=os.environ.get("SUMSUB_SECRET_KEY"),
        help="HMAC secret. Defaults to $SUMSUB_SECRET_KEY. MUST match the value the target API server is using.",
    )
    parser.add_argument(
        "--app-token",
        default=os.environ.get("SUMSUB_APP_TOKEN"),
        help="X-App-Token header. Defaults to $SUMSUB_APP_TOKEN. MUST match the value the target API server is using.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the request without sending it.",
    )
    args = parser.parse_args()

    if not args.applicant_id and not args.user_email:
        parser.error("Either --applicant-id or --user-email must be provided.")
    if not args.secret:
        parser.error("--secret or $SUMSUB_SECRET_KEY is required.")
    if not args.app_token:
        parser.error("--app-token or $SUMSUB_APP_TOKEN is required.")

    applicant_id = args.applicant_id or f"sim-{uuid.uuid4().hex[:24]}"
    payload = build_payload(
        applicant_id=applicant_id,
        external_user_id=args.user_email,
        answer=args.answer,
        review_status=args.review_status,
    )

    body = json.dumps(payload).encode()
    signature = sign(body, args.secret)
    headers = {
        "Content-Type": "application/json",
        "X-App-Token": args.app_token,
        "X-Payload-Digest": signature,
    }
    url = args.api.rstrip("/") + "/api/v1/kyc/webhook"

    print(f"POST {url}")
    print(f"  applicantId        = {applicant_id}")
    print(f"  externalUserId     = {args.user_email or applicant_id}")
    print(f"  reviewAnswer       = {args.answer}")
    print(f"  X-Payload-Digest   = {signature}")
    print()
    print("Body:")
    print(json.dumps(payload, indent=2))

    if args.dry_run:
        print("\n--dry-run set; not sending.")
        return 0

    print()
    resp = requests.post(url, data=body, headers=headers, timeout=30)
    print(f"← {resp.status_code} {resp.reason}")
    try:
        print(json.dumps(resp.json(), indent=2))
    except Exception:
        print(resp.text)

    return 0 if resp.ok else 1


if __name__ == "__main__":
    sys.exit(main())
