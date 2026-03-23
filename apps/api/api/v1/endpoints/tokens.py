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
        asset_type=(token.asset_type.value if hasattr(token.asset_type, "value") else token.asset_type),
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
        asset_type=(request.asset_type.value if hasattr(request.asset_type, "value") else request.asset_type),
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get Chainlink Proof of Reserve data for a commodity token.

    Returns live oracle data: total supply, verified reserve, last update timestamp.
    In dev mode (no feed configured) returns mock data.
    """
    svc = TokenService(db)
    token = await svc.get_token(token_id)
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Token not found")

    feed = getattr(token, "chainlink_por_feed", None)
    if not feed or feed in ("", "placeholder"):
        # Dev mode: return mock PoR data
        return {
            "token_id": str(token_id),
            "feed_address": None,
            "total_supply": str(token.total_supply),
            "verified_reserve": str(token.total_supply),
            "reserve_ratio": 1.0,
            "last_updated": None,
            "is_live": False,
        }

    try:
        from apps.api.services.web3_identity_service import Web3IdentityService
        w3_svc = Web3IdentityService()
        data = await w3_svc.get_proof_of_reserve(feed)
        return {
            "token_id": str(token_id),
            "feed_address": feed,
            "total_supply": str(token.total_supply),
            "verified_reserve": str(data.get("answer", 0)),
            "reserve_ratio": float(data.get("answer", 0)) / float(token.total_supply) if token.total_supply else 0,
            "last_updated": data.get("updated_at"),
            "is_live": True,
        }
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("PoR fetch failed for token %s: %s", token_id, exc)
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


@router.post("/{token_id}/documents")
async def upload_token_document(
    token_id: UUID,
    name: str,
    doc_type: str = "other",
    ipfs_hash: str | None = None,
    url: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user_id: CurrentUserId = None,
) -> dict:
    """Attach a legal document to a token (IPFS hash or URL).

    In production, client should upload to Pinata first and pass the CID here.
    """
    from sqlalchemy import select

    from apps.api.models.token import Token
    from apps.api.models.token_document import TokenDocument

    result = await db.execute(select(Token).where(Token.id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Token not found")

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
async def list_token_documents(token_id: UUID, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """List all documents for a token."""
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
