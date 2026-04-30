"""Sale query service — read-only sale lookups and pagination."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import SaleStatus
from apps.api.models.token_sale import TokenSale


class SaleQueryService:
    """Read-only sale queries: list, get, get-by-slug."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db

    async def get_sale_by_token_slug(self, slug: str) -> TokenSale | None:
        """Get a sale by the token's slug, or by sale ID for tokenless sales.

        An issuer can deploy multiple sales for the same token (e.g. a
        seed round followed by a public round, or a stale draft never
        deleted). Token slug isn't unique across sales, so we resolve in
        two steps to avoid JOIN+selectinload+limit fragility:
          1. Look up Token by slug to get its id.
          2. Pick the most public-facing sale for that token: visible
             rows beat hidden, then ACTIVE > APPROVED_COMING_SOON >
             APPROVED > others, then newest.
        Visibility is the first sort key so any sale that appears in the
        public listing is guaranteed to resolve here too.
        """
        from apps.api.models.token import Token

        token_id = (
            await self.db.execute(
                select(Token.id).where(Token.slug == slug).limit(1)
            )
        ).scalar_one_or_none()

        if token_id is not None:
            status_priority = case(
                (TokenSale.status == SaleStatus.ACTIVE, 0),
                (TokenSale.status == SaleStatus.APPROVED_COMING_SOON, 1),
                (TokenSale.status == SaleStatus.APPROVED, 2),
                (TokenSale.status == SaleStatus.PENDING_APPROVAL, 3),
                (TokenSale.status == SaleStatus.FINALIZED_SUCCESS, 4),
                else_=5,
            )
            query = (
                select(TokenSale)
                .where(TokenSale.token_id == token_id)
                .options(
                    selectinload(TokenSale.phases),
                    selectinload(TokenSale.token),
                    selectinload(TokenSale.issuer),
                    selectinload(TokenSale.images),
                )
                .order_by(
                    TokenSale.is_visible.desc(),
                    status_priority.asc(),
                    TokenSale.created_at.desc(),
                )
                .limit(1)
            )
            sale = (await self.db.execute(query)).scalar_one_or_none()
            if sale is not None:
                return sale

        # Fallback: tokenless sales (e.g. coming-soon) referenced by sale ID.
        try:
            sale_uuid = UUID(slug)
        except ValueError:
            return None
        query = (
            select(TokenSale)
            .where(TokenSale.id == sale_uuid)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
        )
        return (await self.db.execute(query)).scalar_one_or_none()

    async def list_sales(
        self,
        page: int = 1,
        size: int = 20,
        status_filter: SaleStatus | None = None,
        public_only: bool = False,
    ) -> tuple[list[TokenSale], int]:
        """List sales with pagination and optional status filter.

        If public_only=True, only returns ACTIVE and APPROVED_COMING_SOON sales.
        """
        # Sort: admin-set display_order first (NULLs last), then status priority
        # (active before coming_soon before others), then newest first.
        status_priority = case(
            (TokenSale.status == SaleStatus.ACTIVE, 0),
            (TokenSale.status == SaleStatus.APPROVED, 1),
            (TokenSale.status.in_([SaleStatus.APPROVED_COMING_SOON]), 2),
            else_=3,
        )
        query = (
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
            .order_by(
                TokenSale.display_order.asc().nulls_last(),
                status_priority,
                TokenSale.created_at.desc(),
            )
        )

        count_query = select(func.count()).select_from(TokenSale)

        if public_only:
            query = query.where(TokenSale.is_visible == True)  # noqa: E712
            count_query = count_query.where(TokenSale.is_visible == True)  # noqa: E712
        if status_filter:
            query = query.where(TokenSale.status == status_filter)
            count_query = count_query.where(TokenSale.status == status_filter)

        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_sale(self, sale_id: UUID) -> TokenSale:
        """Get a sale by ID with all relations eagerly loaded."""
        result = await self.db.execute(
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
            .where(TokenSale.id == sale_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )
        return sale
