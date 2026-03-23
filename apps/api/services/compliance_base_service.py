"""Compliance service for regulatory actions.

CRITICAL: ALL compliance actions MUST be logged to audit_logs.
The audit_logs table is APPEND-ONLY for compliance purposes.
"""

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.audit_log import AuditLog
from apps.api.models.enums import UserRole
from apps.api.models.token import Token
from apps.api.models.user import User


class ComplianceBaseService:
    """Service for compliance operations.

    CRITICAL: All operations write to audit_logs.
    """

    def __init__(self, db: AsyncSession) -> None:
        """Initialize compliance service."""
        self.db = db

    async def _write_audit(
        self,
        actor_id: UUID | None,
        action: str,
        target_type: str,
        target_id: str,
        payload: dict[str, Any] | None = None,
        ip_address: str | None = None,
        reason: str | None = None,
    ) -> AuditLog:
        """Write an audit log entry.

        CRITICAL: Audit logs are append-only for compliance.
        """
        audit = AuditLog()
        audit.actor_id = actor_id
        audit.action = action
        audit.target_type = target_type
        audit.target_id = target_id
        audit.payload = payload
        audit.ip_address = ip_address
        audit.reason = reason

        self.db.add(audit)
        await self.db.flush()

        return audit

    async def _verify_authorization(
        self, user_id: UUID, token_id: UUID | None = None, require_issuer: bool = False
    ) -> User:
        """Verify user is authorized for compliance actions.

        Args:
            user_id: User UUID.
            token_id: Optional token UUID (for issuer ownership check).
            require_issuer: Whether user must be the token's issuer.

        Returns:
            Authorized user.

        Raises:
            HTTPException: If not authorized.
        """
        result = await self.db.execute(
            select(User).options(selectinload(User.issuer)).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        # Platform admin can do anything
        if user.role == UserRole.ADMIN:
            return user

        # For issuer actions, check they have issuer role
        if user.role != UserRole.ISSUER or not user.issuer:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Issuer role required"},
            )

        # If token specified, verify ownership
        if token_id and require_issuer:
            token_result = await self.db.execute(select(Token).where(Token.id == token_id))
            token = token_result.scalar_one_or_none()

            if not token or token.issuer_id != user.issuer.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "NOT_TOKEN_OWNER", "message": "Not authorized for this token"},
                )

        return user

    async def freeze_address(
        self,
        actor_id: UUID,
        wallet_address: str,
        token_id: UUID | None,
        reason: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Freeze a wallet address.

        Args:
            actor_id: User performing the action.
            wallet_address: Address to freeze.
            token_id: Optional token (for token-specific freeze).
            reason: Reason for freeze.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id)

        # Execute on-chain freeze if token has a deployed contract
        if token_id:
            token_result = await self.db.execute(select(Token).where(Token.id == token_id))
            token = token_result.scalar_one_or_none()
            if token and token.contract_address and token.contract_address != ("0x" + "0" * 40):
                try:
                    from apps.api.services.web3_token_service import Web3TokenService

                    web3_svc = Web3TokenService()
                    await web3_svc.freeze_address(token.contract_address, wallet_address)
                except Exception:
                    import logging

                    logging.getLogger(__name__).warning(
                        "On-chain freeze failed, proceeding with DB-only"
                    )

        audit = await self._write_audit(
            actor_id=actor_id,
            action="freeze",
            target_type="wallet",
            target_id=wallet_address,
            payload={"token_id": str(token_id) if token_id else None},
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit

    async def unfreeze_address(
        self,
        actor_id: UUID,
        wallet_address: str,
        token_id: UUID | None,
        reason: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Unfreeze a wallet address.

        Args:
            actor_id: User performing the action.
            wallet_address: Address to unfreeze.
            token_id: Optional token (for token-specific unfreeze).
            reason: Reason for unfreeze.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id)

        # Execute on-chain unfreeze if token has a deployed contract
        if token_id:
            token_result = await self.db.execute(select(Token).where(Token.id == token_id))
            token = token_result.scalar_one_or_none()
            if token and token.contract_address and token.contract_address != ("0x" + "0" * 40):
                try:
                    from apps.api.services.web3_token_service import Web3TokenService

                    web3_svc = Web3TokenService()
                    await web3_svc.unfreeze_address(token.contract_address, wallet_address)
                except Exception:
                    import logging

                    logging.getLogger(__name__).warning(
                        "On-chain unfreeze failed, proceeding with DB-only"
                    )

        audit = await self._write_audit(
            actor_id=actor_id,
            action="unfreeze",
            target_type="wallet",
            target_id=wallet_address,
            payload={"token_id": str(token_id) if token_id else None},
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit
