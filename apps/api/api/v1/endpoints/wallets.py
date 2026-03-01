"""Wallet management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.wallet import LinkWalletRequest, WalletListResponse, WalletResponse
from apps.api.services.wallet_service import WalletService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/wallets", tags=["wallets"])


async def get_wallet_service(db: Annotated[AsyncSession, Depends(get_db)]) -> WalletService:
    return WalletService(db)


def _wallet_to_response(w: object) -> WalletResponse:
    return WalletResponse(
        id=str(w.id),
        address=w.address_checksum,
        chain_id=w.chain_id,
        is_primary=w.is_primary,
        is_safe=w.is_safe,
        registered_on_chain=w.registered_on_chain,
        label=w.label,
        linked_at=w.linked_at.isoformat() if w.linked_at else "",
    )


@router.get("", response_model=WalletListResponse)
async def list_wallets(
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> WalletListResponse:
    wallets = await service.list_wallets(user_id)
    return WalletListResponse(
        wallets=[_wallet_to_response(w) for w in wallets],
        total=len(wallets),
    )


@router.post("", response_model=WalletResponse, status_code=201)
async def link_wallet(
    request: LinkWalletRequest,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> WalletResponse:
    wallet = await service.link_wallet(
        user_id=user_id,
        address=request.address,
        signature=request.signature,
        nonce=request.nonce,
        is_safe=request.is_safe,
        label=request.label,
    )
    return _wallet_to_response(wallet)


@router.delete("/{address}", status_code=204)
async def unlink_wallet(
    address: str,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> None:
    await service.unlink_wallet(user_id, address)


@router.patch("/{address}/primary", response_model=WalletResponse)
async def set_primary_wallet(
    address: str,
    user_id: CurrentUserId,
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> WalletResponse:
    wallet = await service.set_primary(user_id, address)
    return _wallet_to_response(wallet)
