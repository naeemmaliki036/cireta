"""Compliance action service — forced transfer, recover, pause, unpause.

CRITICAL: ALL compliance actions MUST be logged to audit_logs.
The audit_logs table is APPEND-ONLY for compliance purposes.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from apps.api.models.audit_log import AuditLog
from apps.api.models.token import Token
from apps.api.services.compliance_base_service import ComplianceBaseService


class ComplianceActionService(ComplianceBaseService):
    """Forced transfer, recovery, and pause/unpause operations."""

    async def forced_transfer(
        self,
        actor_id: UUID,
        from_address: str,
        to_address: str,
        token_id: UUID,
        amount: str,
        reason: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Execute a forced token transfer.

        Only issuer of the token can perform this action.

        Args:
            actor_id: User performing the action.
            from_address: Source address.
            to_address: Destination address.
            token_id: Token UUID.
            amount: Amount to transfer.
            reason: Reason for transfer.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Execute on-chain forced transfer
        token_result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = token_result.scalar_one_or_none()
        if token and token.contract_address and token.contract_address != ("0x" + "0" * 40):
            try:
                from apps.api.services.web3_token_service import Web3TokenService

                web3_svc = Web3TokenService()
                amount_int = int(Decimal(str(amount)) * Decimal(10 ** (token.decimals or 18)))
                await web3_svc.forced_transfer(
                    token.contract_address,
                    from_address,
                    to_address,
                    amount_int,
                )
            except Exception:
                import logging

                logging.getLogger(__name__).error(
                    "On-chain forced transfer failed for token=%s from=%s to=%s",
                    token_id,
                    from_address,
                    to_address,
                    exc_info=True,
                )
                raise

        audit = await self._write_audit(
            actor_id=actor_id,
            action="forced_transfer",
            target_type="token",
            target_id=str(token_id),
            payload={
                "from_address": from_address,
                "to_address": to_address,
                "amount": amount,
            },
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit

    async def recover_tokens(
        self,
        actor_id: UUID,
        from_address: str,
        token_id: UUID,
        amount: str,
        reason: str,
        to_address: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Recover tokens from an address.

        Only issuer of the token can perform this action.

        Args:
            actor_id: User performing the action.
            from_address: Address to recover from.
            token_id: Token UUID.
            amount: Amount to recover.
            reason: Reason for recovery.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Execute on-chain token recovery
        token_result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = token_result.scalar_one_or_none()
        if token and token.contract_address and token.contract_address != ("0x" + "0" * 40):
            try:
                from apps.api.services.web3_token_service import Web3TokenService

                web3_svc = Web3TokenService()
                amount_int = int(Decimal(str(amount)) * Decimal(10 ** (token.decimals or 18)))
                await web3_svc.recover_tokens(
                    token.contract_address,
                    from_address,
                    amount_int,
                )
            except Exception:
                import logging

                logging.getLogger(__name__).error(
                    "On-chain recovery failed for token=%s from=%s",
                    token_id,
                    from_address,
                    exc_info=True,
                )
                raise

        audit = await self._write_audit(
            actor_id=actor_id,
            action="recover_tokens",
            target_type="token",
            target_id=str(token_id),
            payload={
                "from_address": from_address,
                "to_address": to_address,
                "amount": amount,
            },
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit

    async def pause_token(
        self,
        actor_id: UUID,
        token_id: UUID,
        reason: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Pause all transfers for a token.

        Only issuer of the token can perform this action.

        Args:
            actor_id: User performing the action.
            token_id: Token UUID.
            reason: Reason for pause.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Update token state
        result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = result.scalar_one()
        token.is_paused = True

        # Execute on-chain pause
        if token.contract_address and token.contract_address != ("0x" + "0" * 40):
            try:
                from apps.api.services.web3_token_service import Web3TokenService

                web3_svc = Web3TokenService()
                await web3_svc.pause_token(token.contract_address)
            except Exception:
                import logging

                logging.getLogger(__name__).error(
                    "On-chain pause failed for token=%s",
                    token_id,
                    exc_info=True,
                )
                raise

        audit = await self._write_audit(
            actor_id=actor_id,
            action="pause_token",
            target_type="token",
            target_id=str(token_id),
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit

    async def unpause_token(
        self,
        actor_id: UUID,
        token_id: UUID,
        reason: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Unpause transfers for a token.

        Only issuer of the token can perform this action.

        Args:
            actor_id: User performing the action.
            token_id: Token UUID.
            reason: Reason for unpause.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Update token state
        result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = result.scalar_one()
        token.is_paused = False

        # Execute on-chain unpause
        if token.contract_address and token.contract_address != ("0x" + "0" * 40):
            try:
                from apps.api.services.web3_token_service import Web3TokenService

                web3_svc = Web3TokenService()
                await web3_svc.unpause_token(token.contract_address)
            except Exception:
                import logging

                logging.getLogger(__name__).error(
                    "On-chain unpause failed for token=%s",
                    token_id,
                    exc_info=True,
                )
                raise

        audit = await self._write_audit(
            actor_id=actor_id,
            action="unpause_token",
            target_type="token",
            target_id=str(token_id),
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit
