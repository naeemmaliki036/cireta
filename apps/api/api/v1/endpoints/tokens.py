"""Token endpoints for ERC-3643 security tokens."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.token import (
    TokenCreateRequest,
    TokenListResponse,
    TokenResponse,
)
from apps.api.services.token_service import TokenService
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/tokens", tags=["tokens"])


async def get_token_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenService:
    """Get token service instance."""
    return TokenService(db)


def _token_to_response(token) -> TokenResponse:
    """Convert token model to response."""
    return TokenResponse(
        id=str(token.id),
        issuer_id=str(token.issuer_id),
        name=token.name,
        symbol=token.symbol,
        asset_type=token.asset_type.value,
        contract_address=token.contract_address,
        chain_id=token.chain_id,
        total_supply=str(token.total_supply),
        decimals=token.decimals,
        ipfs_docs_hash=token.ipfs_docs_hash,
        chainlink_por_feed=token.chainlink_por_feed,
        is_paused=token.is_paused,
        is_deployed=token.is_deployed,
    )


@router.get("/", response_model=TokenListResponse)
async def list_tokens(
    token_service: Annotated[TokenService, Depends(get_token_service)],
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    issuer_id: UUID | None = None,
) -> TokenListResponse:
    """List all tokens with pagination.

    Public endpoint.
    """
    tokens, total = await token_service.list_tokens(page, size, issuer_id)

    return TokenListResponse(
        items=[_token_to_response(t) for t in tokens],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{token_id}", response_model=TokenResponse)
async def get_token(
    token_id: UUID,
    token_service: Annotated[TokenService, Depends(get_token_service)],
) -> TokenResponse:
    """Get token details.

    Public endpoint.
    """
    token = await token_service.get_token(token_id)
    return _token_to_response(token)


@router.post("/", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def create_token(
    request: TokenCreateRequest,
    user_id: CurrentUserId,
    token_service: Annotated[TokenService, Depends(get_token_service)],
) -> TokenResponse:
    """Create a new token.

    Requires: issuer role.
    """
    token = await token_service.create_token(
        user_id=user_id,
        name=request.name,
        symbol=request.symbol,
        asset_type=request.asset_type.value,
        total_supply=request.total_supply,
        decimals=request.decimals,
        ipfs_docs_hash=request.ipfs_docs_hash,
        chainlink_por_feed=request.chainlink_por_feed,
    )
    return _token_to_response(token)


@router.post("/{token_id}/deploy", response_model=TokenResponse)
async def deploy_token(
    token_id: UUID,
    user_id: CurrentUserId,
    token_service: Annotated[TokenService, Depends(get_token_service)],
) -> TokenResponse:
    """Deploy token contract to blockchain.

    Requires: issuer role (must be token owner).
    """
    token = await token_service.deploy_contract(user_id, token_id)
    return _token_to_response(token)
