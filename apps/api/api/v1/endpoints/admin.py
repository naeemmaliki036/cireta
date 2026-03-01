"""Admin endpoints — shim that re-exports issuer and compliance routers.

Implementation split across:
  admin_issuers.py    — issuer CRUD, fee, revoke, activate
  admin_compliance.py — freeze, unfreeze, forced-transfer, recover, pause, unpause
"""

from apps.api.api.v1.endpoints.admin_compliance import router as compliance_router  # noqa: F401
from apps.api.api.v1.endpoints.admin_issuers import router as issuers_router  # noqa: F401

# The main router.py includes both sub-routers directly
# This shim exposes both for the v1 router to pick up
__all__ = ["issuers_router", "compliance_router"]
