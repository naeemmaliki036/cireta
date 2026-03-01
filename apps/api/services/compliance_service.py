"""Compliance service — shim re-export for backwards compatibility.

Implementation split across:
  compliance_base_service.py    — _write_audit, _verify_authorization, freeze, unfreeze
  compliance_action_service.py  — forced_transfer, recover_tokens, pause_token, unpause_token
"""

from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.services.compliance_action_service import ComplianceActionService


class ComplianceService(ComplianceActionService):
    """Full compliance service (all layers).

    All existing imports of ComplianceService continue to work.
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db


__all__ = ["ComplianceService", "ComplianceActionService"]
