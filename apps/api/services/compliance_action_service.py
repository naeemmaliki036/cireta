"""Compliance action service — forced transfer, recover, pause, unpause.

CRITICAL: ALL compliance actions MUST be logged to audit_logs.
The audit_logs table is APPEND-ONLY for compliance purposes.

NOTE: All on-chain actions are executed via the dApp (user's connected wallet).
Backend only records the audit log after the on-chain tx is confirmed.
No backend private key is used.
"""

from uuid import UUID

from sqlalchemy import select

from apps.api.models.audit_log import AuditLog
from apps.api.models.token import Token
from apps.api.services.compliance_base_service import ComplianceBaseService


class ComplianceActionService(ComplianceBaseService):
    """Forced transfer, recovery, and pause/unpause audit recording.

    On-chain execution happens via the dApp. These endpoints record
    the action in the audit log after tx confirmation.
    """

    async def forced_transfer(
        self,
        actor_id: UUID,
        from_address: str,
        to_address: str,
        token_id: UUID,
        amount: str,
        reason: str,
        tx_hash: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Record a forced token transfer executed via dApp.

        Args:
            actor_id: User performing the action.
            from_address: Source address.
            to_address: Destination address.
            token_id: Token UUID.
            amount: Amount transferred.
            reason: Reason for transfer.
            tx_hash: On-chain transaction hash from dApp.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        audit = await self._write_audit(
            actor_id=actor_id,
            action="forced_transfer",
            target_type="token",
            target_id=str(token_id),
            payload={
                "from_address": from_address,
                "to_address": to_address,
                "amount": amount,
                "tx_hash": tx_hash,
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
        tx_hash: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Record a token recovery executed via dApp.

        The contract's recoveryAddress() transfers full balance + frozen
        status from lostWallet to newWallet. This endpoint logs the action.

        Args:
            actor_id: User performing the action.
            from_address: Address recovered from (lost wallet).
            token_id: Token UUID.
            amount: Amount recovered.
            reason: Reason for recovery.
            to_address: Recovery destination (new wallet).
            tx_hash: On-chain transaction hash from dApp.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        audit = await self._write_audit(
            actor_id=actor_id,
            action="recover_tokens",
            target_type="token",
            target_id=str(token_id),
            payload={
                "from_address": from_address,
                "to_address": to_address,
                "amount": amount,
                "tx_hash": tx_hash,
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
        tx_hash: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Record a token pause executed via dApp.

        Args:
            actor_id: User performing the action.
            token_id: Token UUID.
            reason: Reason for pause.
            tx_hash: On-chain transaction hash from dApp.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Update local state
        result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = result.scalar_one()
        token.is_paused = True

        audit = await self._write_audit(
            actor_id=actor_id,
            action="pause_token",
            target_type="token",
            target_id=str(token_id),
            payload={"tx_hash": tx_hash},
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
        tx_hash: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Record a token unpause executed via dApp.

        Args:
            actor_id: User performing the action.
            token_id: Token UUID.
            reason: Reason for unpause.
            tx_hash: On-chain transaction hash from dApp.
            ip_address: Actor's IP address.

        Returns:
            Audit log entry.
        """
        await self._verify_authorization(actor_id, token_id, require_issuer=True)

        # Update local state
        result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = result.scalar_one()
        token.is_paused = False

        audit = await self._write_audit(
            actor_id=actor_id,
            action="unpause_token",
            target_type="token",
            target_id=str(token_id),
            payload={"tx_hash": tx_hash},
            ip_address=ip_address,
            reason=reason,
        )

        await self.db.commit()
        return audit
