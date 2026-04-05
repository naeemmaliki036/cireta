"""API v1 router — aggregates all endpoint routers."""

from fastapi import APIRouter

from apps.api.api.v1.endpoints.admin_compliance import router as admin_compliance_router
from apps.api.api.v1.endpoints.admin_email_templates import router as admin_email_templates_router
from apps.api.api.v1.endpoints.admin_investors import router as admin_investors_router
from apps.api.api.v1.endpoints.admin_issuers import router as admin_issuers_router
from apps.api.api.v1.endpoints.admin_operations import router as admin_operations_router
from apps.api.api.v1.endpoints.admin_reports import router as admin_reports_router
from apps.api.api.v1.endpoints.admin_sales import router as admin_sales_router
from apps.api.api.v1.endpoints.auth import router as auth_router
from apps.api.api.v1.endpoints.health import router as health_router
from apps.api.api.v1.endpoints.issuer_onboarding import router as issuer_onboarding_router
from apps.api.api.v1.endpoints.issuer_withdrawals import router as issuer_withdrawals_router
from apps.api.api.v1.endpoints.kyc import router as kyc_router
from apps.api.api.v1.endpoints.notifications import router as notifications_router
from apps.api.api.v1.endpoints.portfolio import router as portfolio_router
from apps.api.api.v1.endpoints.sale_content import router as sale_content_router
from apps.api.api.v1.endpoints.sale_subscriptions import router as sale_subscriptions_router
from apps.api.api.v1.endpoints.sales import router as sales_router
from apps.api.api.v1.endpoints.token_compliance import router as token_compliance_router
from apps.api.api.v1.endpoints.tokens import router as tokens_router
from apps.api.api.v1.endpoints.uploads import router as uploads_router
from apps.api.api.v1.endpoints.wallets import router as wallets_router

router = APIRouter(prefix="/api/v1")

router.include_router(health_router)
router.include_router(auth_router)
router.include_router(kyc_router)
router.include_router(wallets_router)
router.include_router(notifications_router)
router.include_router(tokens_router)
router.include_router(token_compliance_router)
router.include_router(sales_router)
router.include_router(sale_content_router)
router.include_router(sale_subscriptions_router)
router.include_router(portfolio_router)
router.include_router(admin_issuers_router, prefix="/admin")
router.include_router(admin_compliance_router, prefix="/admin")
router.include_router(admin_investors_router, prefix="/admin")
router.include_router(admin_operations_router, prefix="/admin")
router.include_router(admin_reports_router, prefix="/admin")
router.include_router(admin_email_templates_router, prefix="/admin")
router.include_router(admin_sales_router)
router.include_router(uploads_router)
router.include_router(issuer_onboarding_router)
router.include_router(issuer_withdrawals_router)
