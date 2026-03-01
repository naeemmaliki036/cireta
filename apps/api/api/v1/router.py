"""API v1 router — aggregates all endpoint routers."""

from fastapi import APIRouter

from apps.api.api.v1.endpoints.admin_compliance import router as admin_compliance_router
from apps.api.api.v1.endpoints.admin_investors import router as admin_investors_router
from apps.api.api.v1.endpoints.admin_issuers import router as admin_issuers_router
from apps.api.api.v1.endpoints.auth import router as auth_router
from apps.api.api.v1.endpoints.health import router as health_router
from apps.api.api.v1.endpoints.issuer_withdrawals import router as issuer_withdrawals_router
from apps.api.api.v1.endpoints.kyc import router as kyc_router
from apps.api.api.v1.endpoints.portfolio import router as portfolio_router
from apps.api.api.v1.endpoints.sales import router as sales_router
from apps.api.api.v1.endpoints.tokens import router as tokens_router

router = APIRouter(prefix="/api/v1")

router.include_router(health_router)
router.include_router(auth_router)
router.include_router(kyc_router)
router.include_router(tokens_router)
router.include_router(sales_router)
router.include_router(portfolio_router)
router.include_router(admin_issuers_router, prefix="/admin")
router.include_router(admin_compliance_router, prefix="/admin")
router.include_router(admin_investors_router, prefix="/admin")
router.include_router(issuer_withdrawals_router)
