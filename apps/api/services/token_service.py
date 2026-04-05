"""Token service for ERC-3643 security tokens."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.issuer import Issuer
from apps.api.models.token import Token


import re


def _slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text


class TokenService:
    """Service for token operations."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize token service."""
        self.db = db

    async def _generate_unique_slug(self, name: str) -> str:
        base_slug = _slugify(name)
        slug = base_slug
        counter = 1
        while (
            await self.db.execute(
                select(func.count(Token.id)).where(Token.slug == slug)
            )
        ).scalar_one() > 0:
            slug = f'{base_slug}-{counter}'
            counter += 1
        return slug

    async def create_token(
        self,
        user_id: UUID,
        name: str,
        symbol: str,
        asset_type: str,
        total_supply: Decimal,
        decimals: int = 18,
        ipfs_docs_hash: str | None = None,
        chainlink_por_feed: str | None = None,
    ) -> Token:
        """Create a new token.

        Args:
            user_id: User UUID (must be an issuer).
            name: Token name.
            symbol: Token symbol.
            asset_type: Asset type (commodity or futures).
            total_supply: Total token supply.
            decimals: Token decimals.
            ipfs_docs_hash: IPFS hash for legal documents.
            chainlink_por_feed: Chainlink PoR feed address.

        Returns:
            Created token.

        Raises:
            HTTPException: If user is not an issuer.
        """
        # Get issuer for user
        result = await self.db.execute(select(Issuer).where(Issuer.user_id == user_id))
        issuer = result.scalar_one_or_none()

        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_ISSUER", "message": "User is not an issuer"},
            )

        if not issuer.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ISSUER_NOT_ACTIVE", "message": "Issuer is not active"},
            )

        # Check symbol — warn but don't block (multiple tokens can share symbols)
        existing = await self.db.execute(select(Token).where(Token.symbol == symbol.upper()))
        symbol_warning = bool(existing.scalar_one_or_none())

        # Create token
        token = Token()
        token.issuer_id = issuer.id
        token.name = name
        token.symbol = symbol.upper()
        token.slug = await self._generate_unique_slug(name)
        token.asset_type = asset_type
        token.total_supply = total_supply
        token.decimals = decimals
        token.ipfs_docs_hash = ipfs_docs_hash
        token.chainlink_por_feed = chainlink_por_feed

        self.db.add(token)
        await self.db.commit()
        await self.db.refresh(token)

        return token

    async def deploy_contract(self, user_id: UUID, token_id: UUID) -> Token:
        """Deploy token contract to blockchain.

        Args:
            user_id: User UUID (must be token issuer).
            token_id: Token UUID.

        Returns:
            Updated token with contract address.

        Raises:
            HTTPException: If not authorized or already deployed.
        """
        # Get token with issuer
        result = await self.db.execute(
            select(Token).options(selectinload(Token.issuer)).where(Token.id == token_id)
        )
        token = result.scalar_one_or_none()

        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        # Check authorization
        if token.issuer.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized to deploy this token"},
            )

        # Check issuer is fully activated
        if not token.issuer.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ISSUER_NOT_ACTIVE", "message": "Issuer must be fully activated before deploying. Complete onboarding first."},
            )

        if token.is_deployed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_DEPLOYED", "message": "Token already deployed"},
            )

        # Deploy ERC-3643 contract via CiretaTokenFactory
        from apps.api.services.web3_token_service import Web3TokenService

        web3_svc = Web3TokenService()
        issuer_wallet = token.issuer.wallet_address or web3_svc.deployer_address
        if not issuer_wallet:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "NO_WALLET",
                    "message": "Issuer has no wallet address and no deployer account is configured. "
                    "Set the issuer wallet address or configure IDENTITY_SIGNER_PRIVATE_KEY.",
                },
            )

        contract_address, identity_registry, compliance, _receipt = await web3_svc.deploy_erc3643_token(
            name=token.name,
            symbol=token.symbol,
            decimals=token.decimals,
            issuer_wallet=issuer_wallet,
        )
        token.contract_address = contract_address
        token.identity_registry_address = identity_registry
        token.compliance_address = compliance

        await self.db.commit()
        await self.db.refresh(token)

        return token

    async def list_tokens(
        self, page: int = 1, size: int = 20, issuer_id: UUID | None = None
    ) -> tuple[list[Token], int]:
        """List tokens with pagination.

        Args:
            page: Page number (1-indexed).
            size: Page size.
            issuer_id: Optional issuer filter.

        Returns:
            Tuple of (tokens, total_count).
        """
        query = select(Token).order_by(Token.created_at.desc())

        if issuer_id:
            query = query.where(Token.issuer_id == issuer_id)

        # Count total
        count_query = select(func.count()).select_from(Token)
        if issuer_id:
            count_query = count_query.where(Token.issuer_id == issuer_id)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        tokens = list(result.scalars().all())

        return tokens, total

    async def get_token(self, token_id: UUID) -> Token:
        """Get a token by ID.

        Args:
            token_id: Token UUID.

        Returns:
            Token.

        Raises:
            HTTPException: If not found.
        """
        result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = result.scalar_one_or_none()

        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        return token
