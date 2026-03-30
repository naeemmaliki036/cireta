"""Token endpoints for ERC-3643 security tokens."""

import logging
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.schemas.token import (
    TokenCreateRequest,
    TokenListResponse,
    TokenResponse,
)
from apps.api.services.token_service import TokenService
from apps.api.services.web3_base_service import Web3BaseService
from packages.common.core.auth_deps import CurrentUserId, RequireIssuerOrAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

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
        asset_type=(
            token.asset_type.value if hasattr(token.asset_type, "value") else token.asset_type
        ),
        contract_address=token.contract_address,
        chain_id=token.chain_id,
        total_supply=str(token.total_supply),
        decimals=token.decimals,
        ipfs_docs_hash=token.ipfs_docs_hash,
        chainlink_por_feed=token.chainlink_por_feed,
        is_paused=token.is_paused,
        is_deployed=token.is_deployed,
        slug=token.slug,
        description=token.description,
        image_url=token.image_url,
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
        asset_type=(
            request.asset_type.value if hasattr(request.asset_type, "value") else request.asset_type
        ),
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


@router.get("/{token_id}/por")
async def get_proof_of_reserve(
    token_id: UUID,
    _user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get Chainlink Proof of Reserve data for a commodity token.

    Returns live oracle data: total supply, verified reserve, last update timestamp.
    Requires authentication.
    In dev mode (no feed configured) returns estimated data.
    """
    svc = TokenService(db)
    token = await svc.get_token(token_id)
    if not token:
        raise HTTPException(status_code=404, detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"})

    feed = getattr(token, "chainlink_por_feed", None)
    if not feed or feed in ("", "placeholder"):
        return JSONResponse(
            content={
                "token_id": str(token_id),
                "feed_address": None,
                "total_supply": str(token.total_supply),
                "verified_reserve": str(token.total_supply),
                "reserve_ratio": 1.0,
                "last_updated": None,
                "is_live": False,
                "warning": "No Chainlink PoR feed configured — data is estimated, not verified",
            },
            headers={"X-PoR-Status": "estimated"},
        )

    try:
        from apps.api.services.web3_identity_service import Web3IdentityService

        w3_svc = Web3IdentityService()
        data = await w3_svc.get_proof_of_reserve(feed)
        return {
            "token_id": str(token_id),
            "feed_address": feed,
            "total_supply": str(token.total_supply),
            "verified_reserve": str(data.get("answer", 0)),
            "reserve_ratio": str(Decimal(str(data.get("answer", 0))) / Decimal(str(token.total_supply)))
            if token.total_supply
            else "0",
            "last_updated": data.get("updated_at"),
            "is_live": True,
        }
    except Exception as exc:
        logger.error("PoR fetch failed for token %s: %s", token_id, exc)
        return {
            "token_id": str(token_id),
            "feed_address": feed,
            "total_supply": str(token.total_supply),
            "verified_reserve": None,
            "reserve_ratio": None,
            "last_updated": None,
            "is_live": False,
            "error": "Oracle unavailable",
        }


@router.get("/{token_id}/proof-of-reserve")
async def get_chainlink_proof_of_reserve(
    token_id: UUID,
    _user_id: RequireIssuerOrAdmin,
    token_service: Annotated[TokenService, Depends(get_token_service)],
) -> dict:
    """Get Chainlink Proof of Reserve data for a token.

    Calls the on-chain Chainlink aggregator: latestRoundData() + decimals().
    Requires: issuer or admin role.
    """
    token = await token_service.get_token(token_id)

    feed = token.chainlink_por_feed
    if not feed or feed.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "POR_NOT_CONFIGURED", "message": "No Chainlink PoR feed configured for this token"},
        )

    aggregator_abi = [
        {
            "inputs": [],
            "name": "latestRoundData",
            "outputs": [
                {"name": "roundId", "type": "uint80"},
                {"name": "answer", "type": "int256"},
                {"name": "startedAt", "type": "uint256"},
                {"name": "updatedAt", "type": "uint256"},
                {"name": "answeredInRound", "type": "uint80"},
            ],
            "stateMutability": "view",
            "type": "function",
        },
        {
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "stateMutability": "view",
            "type": "function",
        },
    ]

    try:
        w3_svc = Web3BaseService()
        round_data = await w3_svc.call_contract(feed, aggregator_abi, "latestRoundData")
        feed_decimals = await w3_svc.call_contract(feed, aggregator_abi, "decimals")
    except Exception as exc:
        logger.error("PoR on-chain call failed for token %s feed %s", token_id, feed, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "POR_ORACLE_ERROR", "message": "Failed to read Chainlink PoR feed"},
        ) from exc

    round_id, answer, _started_at, updated_at, _answered_in_round = round_data
    scaled_answer = Decimal(str(answer)) / Decimal(10**feed_decimals)

    now_ts = int(__import__("time").time())
    is_stale = (now_ts - updated_at) > 86400  # 24 hours

    return {
        "feed_address": feed,
        "answer": str(scaled_answer),
        "decimals": feed_decimals,
        "updated_at": updated_at,
        "round_id": str(round_id),
        "is_stale": is_stale,
    }


@router.post("/{token_id}/documents")
async def upload_token_document(
    token_id: UUID,
    name: str,
    doc_type: str = "other",
    ipfs_hash: str | None = None,
    url: str | None = None,
    db: AsyncSession = Depends(get_db),
    user_id: CurrentUserId = None,
) -> dict:
    """Attach a legal document to a token (IPFS hash or URL).

    In production, client should upload to Pinata first and pass the CID here.
    Requires: token ownership (issuer must match authenticated user).
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from apps.api.models.token import Token
    from apps.api.models.token_document import TokenDocument

    result = await db.execute(
        select(Token).options(selectinload(Token.issuer)).where(Token.id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"})

    # Null check: token must have an associated issuer
    if not token.issuer:
        raise HTTPException(
            status_code=403,
            detail={"code": "NO_ISSUER", "message": "Token has no associated issuer"},
        )

    # Ownership check: only the issuer who owns this token can attach documents
    if token.issuer.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "NOT_AUTHORIZED", "message": "Not authorized to modify this token"},
        )

    # Validate Pinata is configured if IPFS hash is provided
    if ipfs_hash and not url:
        from packages.common.core.config import settings as _settings

        if not _settings.pinata_api_key:
            if _settings.environment != "development":
                raise RuntimeError(
                    "PINATA_API_KEY not configured — document upload unavailable. "
                    "Set PINATA_API_KEY env var."
                )
            import logging as _logging

            _logging.getLogger(__name__).warning(
                "PINATA_API_KEY not set in development — IPFS gateway URL may not resolve"
            )

    doc = TokenDocument(
        token_id=token_id,
        name=name,
        doc_type=doc_type,
        ipfs_hash=ipfs_hash,
        url=url or (f"https://gateway.pinata.cloud/ipfs/{ipfs_hash}" if ipfs_hash else None),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {
        "id": str(doc.id),
        "token_id": str(token_id),
        "name": doc.name,
        "doc_type": doc.doc_type,
        "ipfs_hash": doc.ipfs_hash,
        "url": doc.url,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("/{token_id}/documents")
async def list_token_documents(
    token_id: UUID,
    _user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all documents for a token. Requires authentication."""
    from sqlalchemy import select

    from apps.api.models.token_document import TokenDocument

    results = await db.execute(select(TokenDocument).where(TokenDocument.token_id == token_id))
    docs = results.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "doc_type": d.doc_type,
            "ipfs_hash": d.ipfs_hash,
            "url": d.url,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]
