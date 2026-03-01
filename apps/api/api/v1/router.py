"""API v1 router aggregating all endpoint routers."""

from fastapi import APIRouter

from apps.api.api.v1.endpoints.auth import router as auth_router
from apps.api.api.v1.endpoints.health import router as health_router
from apps.api.api.v1.endpoints.kyc import router as kyc_router

router = APIRouter(prefix="/api/v1")

# Include all endpoint routers
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(kyc_router)

# Future routers will be added here:
# router.include_router(kyc_router)
# router.include_router(tokens_router)
# router.include_router(sales_router)
# router.include_router(portfolio_router)
# router.include_router(admin_router)
