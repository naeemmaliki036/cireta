"""Sale service — shim re-export for backwards compatibility.

Implementation split across:
  sale_create_service.py      — create_sale
  sale_contribute_service.py  — contribute, finalize_sale, claim_tokens, claim_refund
  sale_query_service.py       — list_sales, get_sale, get_sale_by_token_slug
"""

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.services.sale_contribute_service import SaleContributeService
from apps.api.services.sale_create_service import SaleCreateService
from apps.api.services.sale_query_service import SaleQueryService


class SaleService(SaleCreateService, SaleContributeService, SaleQueryService):
    """Full-featured sale service (inherits all layers).

    Existing imports of SaleService continue to work unchanged.
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db


__all__ = [
    "SaleService",
    "SaleCreateService",
    "SaleContributeService",
    "SaleQueryService",
]
