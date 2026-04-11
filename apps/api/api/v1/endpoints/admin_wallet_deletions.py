"""Admin endpoints for reviewing wallet-deletion requests.

Verified buyers cannot self-delete a wallet from their KYC profile —
they instead file a deletion request via DELETE /api/v1/wallets/{addr}
or POST /api/v1/wallets/{addr}/deletion-request. Admins review the
pending requests here, approve or deny, and approved requests trigger
both the wallet unlink and an enqueued ``task_sync_wallet`` job to
revoke the wallet from the on-chain identity registry.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import IdentitySyncJobAction, WalletDeletionRequestStatus
from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from apps.api.models.wallet_deletion_request import WalletDeletionRequest
from apps.api.schemas.wallet import (
    WalletDeletionRequestListResponse,
    WalletDeletionRequestResponse,
    WalletDeletionReviewBody,
)
from apps.api.services.identity_sync_service import enqueue_identity_sync
from apps.api.services.wallet_service import WalletService
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wallet-deletion-requests", tags=["admin-wallet-deletions"])


def _to_response(req: WalletDeletionRequest, user_email: str) -> WalletDeletionRequestResponse:
    return WalletDeletionRequestResponse(
        id=str(req.id),
        user_id=str(req.user_id),
        user_email=user_email,
        wallet_id=str(req.wallet_id),
        wallet_address=req.wallet_address_snapshot,
        reason=req.reason,
        status=req.status if isinstance(req.status, str) else req.status.value,
        requested_at=req.requested_at,
        reviewed_at=req.reviewed_at,
        reviewed_by=str(req.reviewed_by) if req.reviewed_by else None,
        review_notes=req.review_notes,
    )


@router.get("", response_model=WalletDeletionRequestListResponse)
async def list_wallet_deletion_requests(
    admin_id: RequireAdmin,  # noqa: ARG001
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Annotated[
        Literal["pending", "approved", "denied", "all"], Query(alias="status")
    ] = "pending",
) -> WalletDeletionRequestListResponse:
    """List wallet-deletion requests, defaulting to pending only."""
    q = select(WalletDeletionRequest, User.email).join(
        User, WalletDeletionRequest.user_id == User.id
    )
    if status_filter != "all":
        q = q.where(WalletDeletionRequest.status == status_filter)
    q = q.order_by(WalletDeletionRequest.requested_at.desc()).limit(200)
    rows = (await db.execute(q)).all()
    return WalletDeletionRequestListResponse(
        requests=[_to_response(req, email) for req, email in rows],
        total=len(rows),
    )


@router.post("/{request_id}/approve", response_model=WalletDeletionRequestResponse)
async def approve_wallet_deletion_request(
    request_id: UUID,
    body: WalletDeletionReviewBody,
    admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletDeletionRequestResponse:
    """Approve a pending request, unlink the wallet, and enqueue revoke."""
    req_q = await db.execute(
        select(WalletDeletionRequest).where(WalletDeletionRequest.id == request_id)
    )
    req = req_q.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Wallet deletion request not found")
    if req.status != WalletDeletionRequestStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "REQUEST_NOT_PENDING",
                "message": f"Request is already {req.status}.",
            },
        )

    # Resolve the wallet so we can unlink it. If it's been deleted out
    # from under us, we still mark the request approved + enqueue an
    # idempotent revoke (worker no-ops if there's nothing to revoke).
    wallet_q = await db.execute(select(Wallet).where(Wallet.id == req.wallet_id))
    wallet = wallet_q.scalar_one_or_none()

    user_q = await db.execute(select(User).where(User.id == req.user_id))
    user_email = user_q.scalar_one_or_none()
    user_email_str = user_email.email if user_email else ""

    if wallet:
        svc = WalletService(db)
        await svc._perform_unlink(req.user_id, wallet)
    else:
        # Wallet already gone — still enqueue the revoke as a safety
        # net. We pass the snapshot address from the deletion request
        # so task_sync_wallet can call removeFromWhitelist even without
        # a wallet_id.
        try:
            await enqueue_identity_sync(
                db,
                user_id=req.user_id,
                action=IdentitySyncJobAction.REMOVE,
                wallet_id=None,
                wallet_address=req.wallet_address_snapshot,
            )
        except Exception as exc:
            logger.warning(
                "approve: orphan-wallet enqueue failed for request %s: %s",
                request_id, exc,
            )

    req.status = WalletDeletionRequestStatus.APPROVED
    req.reviewed_by = admin_id
    req.reviewed_at = datetime.now(UTC)
    req.review_notes = body.notes
    await db.commit()
    await db.refresh(req)

    # Email the buyer that their request was approved (best-effort).
    try:
        from apps.api.services.email_service import EmailService

        email_svc = EmailService()
        await email_svc.send(
            "wallet_deletion_approved",
            user_email_str,
            variables={
                "wallet_address": req.wallet_address_snapshot,
                "review_notes": body.notes or "",
            },
        )
    except Exception as exc:
        logger.warning(
            "wallet_deletion_approved email failed: request=%s err=%s",
            request_id, exc,
        )

    return _to_response(req, user_email_str)


@router.post("/{request_id}/deny", response_model=WalletDeletionRequestResponse)
async def deny_wallet_deletion_request(
    request_id: UUID,
    body: WalletDeletionReviewBody,
    admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletDeletionRequestResponse:
    """Deny a pending request. The wallet stays linked + on-chain."""
    req_q = await db.execute(
        select(WalletDeletionRequest).where(WalletDeletionRequest.id == request_id)
    )
    req = req_q.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Wallet deletion request not found")
    if req.status != WalletDeletionRequestStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "REQUEST_NOT_PENDING",
                "message": f"Request is already {req.status}.",
            },
        )

    user_q = await db.execute(select(User).where(User.id == req.user_id))
    user_row = user_q.scalar_one_or_none()
    user_email_str = user_row.email if user_row else ""

    req.status = WalletDeletionRequestStatus.DENIED
    req.reviewed_by = admin_id
    req.reviewed_at = datetime.now(UTC)
    req.review_notes = body.notes
    await db.commit()
    await db.refresh(req)

    try:
        from apps.api.services.email_service import EmailService

        email_svc = EmailService()
        await email_svc.send(
            "wallet_deletion_denied",
            user_email_str,
            variables={
                "wallet_address": req.wallet_address_snapshot,
                "review_notes": body.notes or "",
            },
        )
    except Exception as exc:
        logger.warning(
            "wallet_deletion_denied email failed: request=%s err=%s",
            request_id, exc,
        )

    return _to_response(req, user_email_str)
