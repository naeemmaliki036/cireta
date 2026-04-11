"""Wallet management endpoints."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.contribution import Contribution
from apps.api.models.enums import WalletDeletionRequestStatus
from apps.api.models.wallet_deletion_request import WalletDeletionRequest
from apps.api.schemas.wallet import (
    LinkWalletRequest,
    RenameWalletRequest,
    WalletDeletionRequestBody,
    WalletListResponse,
    WalletResponse,
)
from apps.api.services.wallet_service import WalletService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/wallets", tags=["wallets"])


async def get_wallet_service(db: Annotated[AsyncSession, Depends(get_db)]) -> WalletService:
    return WalletService(db)


async def _wallet_to_response(w: object, db: AsyncSession) -> WalletResponse:
    """Build a WalletResponse and enrich with deletion-request /
    contribution flags so the frontend can render the correct affordances
    (disable Remove, show Pending pill, etc.) without an extra round-trip.
    """
    pending_q = await db.execute(
        select(WalletDeletionRequest.id)
        .where(WalletDeletionRequest.wallet_id == w.id)
        .where(WalletDeletionRequest.status == WalletDeletionRequestStatus.PENDING)
        .limit(1)
    )
    has_pending = pending_q.scalar_one_or_none() is not None

    contrib_q = await db.execute(
        select(Contribution.id)
        .where(Contribution.wallet_address == w.address_checksum.lower())
        .limit(1)
    )
    has_contributions = contrib_q.scalar_one_or_none() is not None
    if not has_contributions:
        # Older rows may have stored the checksum case
        contrib_q2 = await db.execute(
            select(Contribution.id)
            .where(Contribution.wallet_address == w.address_checksum)
            .limit(1)
        )
        has_contributions = contrib_q2.scalar_one_or_none() is not None

    return WalletResponse(
        id=str(w.id),
        address=w.address_checksum,
        chain_id=w.chain_id,
        is_primary=w.is_primary,
        is_safe=w.is_safe,
        registered_on_chain=w.registered_on_chain,
        label=w.label,
        linked_at=w.linked_at.isoformat() if w.linked_at else "",
        has_pending_deletion_request=has_pending,
        has_contributions=has_contributions,
    )


def _validate_address(address: str) -> None:
    if not re.match(r"^0x[0-9a-fA-F]{40}$", address):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_ADDRESS", "message": "Invalid Ethereum address format"},
        )


@router.get("", response_model=WalletListResponse)
async def list_wallets(
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletListResponse:
    wallets = await service.list_wallets(user_id)
    enriched = [await _wallet_to_response(w, db) for w in wallets]
    return WalletListResponse(wallets=enriched, total=len(enriched))


@router.post("", response_model=WalletResponse, status_code=201)
async def link_wallet(
    request: LinkWalletRequest,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletResponse:
    wallet = await service.link_wallet(
        user_id=user_id,
        address=request.address,
        signature=request.signature,
        nonce=request.nonce,
        is_safe=request.is_safe,
        label=request.label,
    )
    return await _wallet_to_response(wallet, db)


@router.delete("/{address}")
async def unlink_wallet(
    address: str,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> Response:
    """Remove or request removal of a wallet.

    - Wallets with any sale participation → 409 WALLET_HAS_CONTRIBUTIONS
    - Verified buyers (no contributions) → 202 with deletion-request body
    - Unverified buyers → 200 + actual unlink (existing fast path)
    """
    _validate_address(address)
    result = await service.unlink_wallet(user_id, address)
    if result.get("status") == "deletion_requested":
        return Response(
            content=__import__("json").dumps(result),
            media_type="application/json",
            status_code=status.HTTP_202_ACCEPTED,
        )
    return Response(
        content=__import__("json").dumps(result),
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{address}/deletion-request", status_code=202)
async def request_wallet_deletion(
    address: str,
    body: WalletDeletionRequestBody,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> dict:
    """Explicit endpoint for verified buyers to file a deletion request.

    Same hard restrictions as DELETE — wallets with contributions are
    rejected with 409 — but always routes to admin review regardless of
    KYC state. Useful for the launchpad UI which can call this directly
    so the request body (`reason`) can be set.
    """
    _validate_address(address)
    return await service.request_wallet_deletion(user_id, address, body.reason)


@router.patch("/{address}", response_model=WalletResponse)
async def rename_wallet(
    address: str,
    request: RenameWalletRequest,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletResponse:
    """Rename an existing wallet's label. Per-user case-insensitive unique."""
    _validate_address(address)
    wallet = await service.rename_wallet(user_id, address, request.label)
    return await _wallet_to_response(wallet, db)


@router.patch("/{address}/primary", response_model=WalletResponse)
async def set_primary_wallet(
    address: str,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletResponse:
    _validate_address(address)
    wallet = await service.set_primary(user_id, address)
    return await _wallet_to_response(wallet, db)
