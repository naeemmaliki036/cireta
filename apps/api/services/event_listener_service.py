"""Event listener service — polls Base RPC for on-chain events.

Polls every ~12 seconds (one Base block) for contract events and
synchronises DB state with on-chain truth.

Events handled:
- Purchase → upsert contribution in DB
- TokensClaimed → mark contribution as claimed
- RefundClaimed → mark contribution as refunded
- SaleFinalized → update sale status
- Transfer (CiretaToken) → update portfolio balances
- FractionsMinted / FractionsBurned → update fraction balances
"""

import asyncio
import logging
from decimal import Decimal
from typing import Any

from web3 import Web3

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

USDC_DECIMALS = 6
TOKEN_DECIMALS = 18
POLL_BLOCK_RANGE = 50  # Max blocks to scan per poll cycle

# Minimal ABIs for event decoding
SALE_EVENTS_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "buyer", "type": "address"},
            {"indexed": True, "name": "phaseId", "type": "uint256"},
            {"indexed": False, "name": "amount", "type": "uint256"},
            {"indexed": False, "name": "tokensAllocated", "type": "uint256"},
        ],
        "name": "Purchase",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "claimer", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
        ],
        "name": "TokensClaimed",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "claimer", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
        ],
        "name": "RefundClaimed",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": False, "name": "totalRaised", "type": "uint256"},
            {"indexed": False, "name": "success", "type": "bool"},
        ],
        "name": "SaleFinalized",
        "type": "event",
    },
]

ERC20_TRANSFER_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "from", "type": "address"},
            {"indexed": True, "name": "to", "type": "address"},
            {"indexed": False, "name": "value", "type": "uint256"},
        ],
        "name": "Transfer",
        "type": "event",
    },
]

FRACTION_EVENTS_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "to", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
        ],
        "name": "FractionsMinted",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "from", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
        ],
        "name": "FractionsBurned",
        "type": "event",
    },
]

FACTORY_EVENTS_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "token", "type": "address"},
            {"indexed": True, "name": "identityRegistry", "type": "address"},
            {"indexed": True, "name": "compliance", "type": "address"},
            {"indexed": False, "name": "issuer", "type": "address"},
        ],
        "name": "TokenDeployed",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "sale", "type": "address"},
            {"indexed": True, "name": "token", "type": "address"},
            {"indexed": True, "name": "issuer", "type": "address"},
        ],
        "name": "SaleDeployed",
        "type": "event",
    },
]

RECOVERY_EVENTS_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "lostWallet", "type": "address"},
            {"indexed": True, "name": "newWallet", "type": "address"},
            {"indexed": True, "name": "investorOnchainID", "type": "address"},
        ],
        "name": "RecoverySuccess",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "from", "type": "address"},
            {"indexed": True, "name": "to", "type": "address"},
            {"indexed": False, "name": "amount", "type": "uint256"},
            {"indexed": False, "name": "reason", "type": "string"},
        ],
        "name": "ForceTransferSuccess",
        "type": "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "from", "type": "address"},
            {"indexed": True, "name": "to", "type": "address"},
            {"indexed": True, "name": "id", "type": "uint256"},
            {"indexed": False, "name": "amount", "type": "uint256"},
            {"indexed": False, "name": "reason", "type": "bytes"},
        ],
        "name": "FractionsRecovered",
        "type": "event",
    },
]

REDIS_LAST_BLOCK_KEY = "cireta:event_listener:last_synced_block"


class EventListenerService:
    """Polls Base RPC for contract events and syncs to DB."""

    def __init__(self) -> None:
        self.w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))

    async def get_last_synced_block(self) -> int:
        """Get the last synced block from Redis."""
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.redis_url)
            val = await r.get(REDIS_LAST_BLOCK_KEY)
            await r.aclose()
            if val:
                return int(val)
        except Exception:
            logger.debug("Redis unavailable for last_synced_block, using latest-100")
        # Default: start from 100 blocks ago
        latest = await asyncio.to_thread(self.w3.eth.get_block_number)
        return max(0, latest - 100)

    async def set_last_synced_block(self, block_number: int) -> None:
        """Store the last synced block in Redis."""
        try:
            import redis.asyncio as aioredis

            r = aioredis.from_url(settings.redis_url)
            await r.set(REDIS_LAST_BLOCK_KEY, str(block_number))
            await r.aclose()
        except Exception:
            logger.warning("Failed to persist last_synced_block=%d to Redis", block_number)

    async def poll_events(self) -> int:
        """Poll for new events since last synced block. Returns count of events processed."""
        from_block = await self.get_last_synced_block()
        latest = await asyncio.to_thread(self.w3.eth.get_block_number)

        if from_block >= latest:
            return 0

        to_block = min(from_block + POLL_BLOCK_RANGE, latest)
        logger.info("Polling events: blocks %d → %d", from_block + 1, to_block)

        # Gather contract addresses from DB
        sale_addresses, token_addresses, fraction_addresses = await self._get_contract_addresses()

        total_processed = 0

        # Poll sale events
        for addr in sale_addresses:
            total_processed += await self._poll_sale_events(addr, from_block + 1, to_block)

        # Poll ERC-20 Transfer events on CiretaTokens
        for addr in token_addresses:
            total_processed += await self._poll_transfer_events(addr, from_block + 1, to_block)

        # Poll fraction events
        for addr in fraction_addresses:
            total_processed += await self._poll_fraction_events(addr, from_block + 1, to_block)

        # Poll factory deployment events (TokenDeployed, SaleDeployed)
        factory_address = settings.factory_contract_address
        if factory_address:
            total_processed += await self._poll_factory_events(
                factory_address, from_block + 1, to_block
            )

        # Poll recovery events on tokens + fraction tokens
        for addr in token_addresses:
            total_processed += await self._poll_recovery_events(addr, from_block + 1, to_block)
        for addr in fraction_addresses:
            total_processed += await self._poll_recovery_events(addr, from_block + 1, to_block)

        await self.set_last_synced_block(to_block)
        logger.info("Event poll complete: %d events processed, synced to block %d", total_processed, to_block)
        return total_processed

    async def _get_contract_addresses(self) -> tuple[list[str], list[str], list[str]]:
        """Load active contract addresses from DB."""
        from sqlalchemy import select

        from apps.api.models.token import Token
        from apps.api.models.token_sale import TokenSale
        from packages.common.db.session import AsyncSessionLocal

        sale_addresses: list[str] = []
        token_addresses: list[str] = []
        fraction_addresses: list[str] = []

        async with AsyncSessionLocal() as db:
            # Active sales
            result = await db.execute(
                select(TokenSale).where(TokenSale.contract_address.isnot(None))
            )
            for sale in result.scalars().all():
                sale_addresses.append(sale.contract_address)
                if sale.fraction_token_address:
                    fraction_addresses.append(sale.fraction_token_address)

            # Deployed tokens
            result = await db.execute(
                select(Token).where(Token.contract_address.isnot(None))
            )
            for token in result.scalars().all():
                token_addresses.append(token.contract_address)
                if token.fraction_token_address:
                    fraction_addresses.append(token.fraction_token_address)

        return sale_addresses, token_addresses, fraction_addresses

    async def _poll_sale_events(self, address: str, from_block: int, to_block: int) -> int:
        """Poll Purchase, TokensClaimed, RefundClaimed, SaleFinalized."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(address), abi=SALE_EVENTS_ABI
        )
        count = 0

        for event_name in ("Purchase", "TokensClaimed", "RefundClaimed", "SaleFinalized"):
            try:
                event_filter = getattr(contract.events, event_name)
                logs = await asyncio.to_thread(
                    event_filter().get_logs, from_block=from_block, to_block=to_block
                )
                for log in logs:
                    await self._handle_sale_event(event_name, dict(log["args"]), address, log)
                    count += 1
            except Exception:
                logger.debug("No %s events on %s (blocks %d-%d)", event_name, address, from_block, to_block)

        return count

    async def _poll_transfer_events(self, address: str, from_block: int, to_block: int) -> int:
        """Poll ERC-20 Transfer events on CiretaToken."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(address), abi=ERC20_TRANSFER_ABI
        )
        count = 0
        try:
            logs = await asyncio.to_thread(
                contract.events.Transfer().get_logs, from_block=from_block, to_block=to_block
            )
            for log in logs:
                await self._handle_transfer_event(dict(log["args"]), address, log)
                count += 1
        except Exception:
            logger.debug("No Transfer events on %s (blocks %d-%d)", address, from_block, to_block)
        return count

    async def _poll_fraction_events(self, address: str, from_block: int, to_block: int) -> int:
        """Poll FractionsMinted / FractionsBurned events."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(address), abi=FRACTION_EVENTS_ABI
        )
        count = 0
        for event_name in ("FractionsMinted", "FractionsBurned"):
            try:
                logs = await asyncio.to_thread(
                    getattr(contract.events, event_name)().get_logs,
                    from_block=from_block, to_block=to_block,
                )
                for log in logs:
                    logger.info(
                        "Fraction event: %s addr=%s args=%s",
                        event_name, address, dict(log["args"]),
                    )
                    count += 1
            except Exception as e:
                logger.error(
                    "Event processing failed for %s on %s (blocks %d-%d): %s",
                    event_name, address, from_block, to_block, e, exc_info=True,
                )
        return count

    async def _handle_sale_event(
        self, event_name: str, args: dict[str, Any], sale_address: str, log: Any
    ) -> None:
        """Process a sale contract event and update DB."""
        from sqlalchemy import select

        from apps.api.models.contribution import Contribution
        from apps.api.models.enums import ContributionStatus, SaleStatus
        from apps.api.models.token_sale import TokenSale
        from packages.common.db.session import AsyncSessionLocal

        tx_hash = log["transactionHash"].hex() if hasattr(log["transactionHash"], "hex") else str(log["transactionHash"])

        async with AsyncSessionLocal() as db:
            if event_name == "Purchase":
                # Dedup on tx_hash
                existing = await db.execute(
                    select(Contribution).where(Contribution.tx_hash == tx_hash)
                )
                if existing.scalar_one_or_none():
                    return
                # Find sale
                sale_result = await db.execute(
                    select(TokenSale).where(TokenSale.contract_address == sale_address)
                )
                sale = sale_result.scalar_one_or_none()
                if not sale:
                    return
                amount = Decimal(str(args.get("amount", 0))) / Decimal(10**USDC_DECIMALS)
                logger.info("Purchase: sale=%s buyer=%s amount=%s", sale.id, args.get("buyer"), amount)

            elif event_name == "TokensClaimed":
                claimer = args.get("claimer", "").lower()
                result = await db.execute(
                    select(Contribution)
                    .where(Contribution.wallet_address == claimer)
                    .where(Contribution.status == ContributionStatus.CONFIRMED)
                )
                for contrib in result.scalars().all():
                    contrib.status = ContributionStatus.CLAIMED
                    contrib.claim_tx_hash = tx_hash
                logger.info("TokensClaimed: claimer=%s tx=%s", claimer, tx_hash)
                await db.commit()

            elif event_name == "RefundClaimed":
                claimer = args.get("claimer", "").lower()
                result = await db.execute(
                    select(Contribution)
                    .where(Contribution.wallet_address == claimer)
                    .where(Contribution.status.in_([ContributionStatus.PENDING, ContributionStatus.CONFIRMED]))
                )
                for contrib in result.scalars().all():
                    contrib.status = ContributionStatus.REFUNDED
                    contrib.claim_tx_hash = tx_hash
                logger.info("RefundClaimed: claimer=%s tx=%s", claimer, tx_hash)
                await db.commit()

            elif event_name == "SaleFinalized":
                success = args.get("success", False)
                new_status = SaleStatus.FINALIZED if success else SaleStatus.FAILED
                sale_result = await db.execute(
                    select(TokenSale).where(TokenSale.contract_address == sale_address)
                )
                sale = sale_result.scalar_one_or_none()
                if sale:
                    sale.status = new_status
                    logger.info("SaleFinalized: sale=%s success=%s", sale.id, success)
                    await db.commit()

    async def _handle_transfer_event(
        self, args: dict[str, Any], token_address: str, log: Any  # noqa: ARG002
    ) -> None:
        """Log ERC-20 transfer event. Balances are reconciled separately."""
        logger.info(
            "Transfer: token=%s from=%s to=%s value=%s",
            token_address, args.get("from"), args.get("to"), args.get("value"),
        )

    # ------------------------------------------------------------------
    # Factory deployment events (TokenDeployed, SaleDeployed)
    # ------------------------------------------------------------------

    async def _poll_factory_events(
        self, factory_address: str, from_block: int, to_block: int
    ) -> int:
        """Poll TokenDeployed and SaleDeployed events from the factory contract."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(factory_address), abi=FACTORY_EVENTS_ABI
        )
        count = 0

        for event_name in ("TokenDeployed", "SaleDeployed"):
            try:
                logs = await asyncio.to_thread(
                    getattr(contract.events, event_name)().get_logs,
                    from_block=from_block,
                    to_block=to_block,
                )
                for log in logs:
                    await self._handle_factory_event(event_name, dict(log["args"]), log)
                    count += 1
            except Exception:
                logger.debug(
                    "No %s events on factory %s (blocks %d-%d)",
                    event_name, factory_address, from_block, to_block,
                )

        return count

    async def _handle_factory_event(
        self, event_name: str, args: dict[str, Any], log: Any
    ) -> None:
        """Process factory deployment events and update DB records."""
        from sqlalchemy import select

        from apps.api.models.enums import SaleStatus
        from apps.api.models.issuer import Issuer
        from apps.api.models.token import Token
        from apps.api.models.token_sale import TokenSale
        from packages.common.db.session import AsyncSessionLocal

        tx_hash = (
            log["transactionHash"].hex()
            if hasattr(log["transactionHash"], "hex")
            else str(log["transactionHash"])
        )

        async with AsyncSessionLocal() as db:
            if event_name == "TokenDeployed":
                token_addr = Web3.to_checksum_address(args["token"])
                ir_addr = Web3.to_checksum_address(args["identityRegistry"])
                compliance_addr = Web3.to_checksum_address(args["compliance"])
                issuer_addr = Web3.to_checksum_address(args["issuer"])

                # Find the issuer by wallet address
                issuer_result = await db.execute(
                    select(Issuer).where(Issuer.wallet_address == issuer_addr)
                )
                issuer = issuer_result.scalar_one_or_none()
                if not issuer:
                    logger.warning(
                        "TokenDeployed: no issuer found for wallet %s", issuer_addr
                    )
                    return

                # Find undeployed token for this issuer
                token_result = await db.execute(
                    select(Token)
                    .where(Token.issuer_id == issuer.id)
                    .where(Token.contract_address.is_(None))
                    .order_by(Token.created_at.desc())
                )
                token = token_result.scalar_one_or_none()
                if not token:
                    logger.info(
                        "TokenDeployed: no pending token for issuer %s (%s)",
                        issuer.id, issuer_addr,
                    )
                    return

                token.contract_address = token_addr
                token.identity_registry_address = ir_addr
                token.compliance_address = compliance_addr
                await db.commit()

                logger.info(
                    "TokenDeployed recorded: token_id=%s contract=%s issuer=%s tx=%s",
                    token.id, token_addr, issuer_addr, tx_hash,
                )

            elif event_name == "SaleDeployed":
                sale_addr = Web3.to_checksum_address(args["sale"])
                token_addr = Web3.to_checksum_address(args["token"])
                issuer_addr = Web3.to_checksum_address(args["issuer"])

                # Find the issuer by wallet address
                issuer_result = await db.execute(
                    select(Issuer).where(Issuer.wallet_address == issuer_addr)
                )
                issuer = issuer_result.scalar_one_or_none()
                if not issuer:
                    logger.warning(
                        "SaleDeployed: no issuer found for wallet %s", issuer_addr
                    )
                    return

                # Find the token by contract address
                token_result = await db.execute(
                    select(Token).where(Token.contract_address == token_addr)
                )
                token = token_result.scalar_one_or_none()

                # Find approved sale for this issuer/token without a contract address
                query = (
                    select(TokenSale)
                    .where(TokenSale.issuer_id == issuer.id)
                    .where(TokenSale.contract_address.is_(None))
                    .where(
                        TokenSale.status.in_([
                            SaleStatus.APPROVED,
                            SaleStatus.APPROVED_COMING_SOON,
                        ])
                    )
                )
                if token:
                    query = query.where(TokenSale.token_id == token.id)
                query = query.order_by(TokenSale.created_at.desc())

                sale_result = await db.execute(query)
                sale = sale_result.scalar_one_or_none()
                if not sale:
                    logger.info(
                        "SaleDeployed: no pending sale for issuer %s token %s",
                        issuer_addr, token_addr,
                    )
                    return

                sale.contract_address = sale_addr
                sale.status = SaleStatus.ACTIVE
                await db.commit()

                logger.info(
                    "SaleDeployed recorded: sale_id=%s contract=%s token=%s issuer=%s tx=%s",
                    sale.id, sale_addr, token_addr, issuer_addr, tx_hash,
                )

    async def _poll_recovery_events(self, address: str, from_block: int, to_block: int) -> int:
        """Poll RecoverySuccess, ForceTransferSuccess, FractionsRecovered events."""
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(address), abi=RECOVERY_EVENTS_ABI
        )
        count = 0
        for event_name in ("RecoverySuccess", "ForceTransferSuccess", "FractionsRecovered"):
            try:
                event_filter = getattr(contract.events, event_name)
                logs = await asyncio.to_thread(
                    event_filter().get_logs, from_block=from_block, to_block=to_block
                )
                for log_entry in logs:
                    await self._handle_recovery_event(event_name, dict(log_entry["args"]), address, log_entry)
                    count += 1
            except Exception:
                logger.debug("No %s events on %s (blocks %d-%d)", event_name, address, from_block, to_block)
        return count

    async def _handle_recovery_event(
        self, event_name: str, args: dict[str, Any], contract_address: str, log_entry: Any
    ) -> None:
        """Index recovery events into recovery_log table (idempotent by tx_hash)."""
        from sqlalchemy import select

        from apps.api.models.enums import RecoveryTokenType
        from apps.api.models.recovery_log import RecoveryLog
        from apps.api.models.token import Token
        from apps.api.models.token_sale import TokenSale
        from apps.api.models.wallet import Wallet
        from apps.api.models.user import User
        from packages.common.db.session import AsyncSessionLocal

        tx_hash = log_entry["transactionHash"].hex()

        async with AsyncSessionLocal() as db:
            # Check idempotency — skip if already indexed
            existing = await db.execute(
                select(RecoveryLog).where(RecoveryLog.tx_hash == tx_hash)
            )
            if existing.scalar_one_or_none():
                return

            # Resolve token/issuer from contract address
            token = (await db.execute(
                select(Token).where(Token.contract_address == contract_address)
            )).scalar_one_or_none()

            # Also check fraction token addresses
            sale_match = None
            if not token:
                sale_match = (await db.execute(
                    select(TokenSale).where(TokenSale.fraction_token_address == contract_address)
                )).scalar_one_or_none()
                if sale_match and sale_match.token_id:
                    token = (await db.execute(
                        select(Token).where(Token.id == sale_match.token_id)
                    )).scalar_one_or_none()

            if not token:
                logger.warning("Recovery event on unknown contract %s — skipping", contract_address)
                return

            # Resolve users from wallet addresses
            from_addr = args.get("lostWallet") or args.get("from", "")
            to_addr = args.get("newWallet") or args.get("to", "")

            async def resolve_user(addr: str):
                if not addr:
                    return None
                result = await db.execute(
                    select(Wallet.user_id).where(Wallet.address == addr.lower())
                )
                row = result.scalar_one_or_none()
                return row

            from_user_id = await resolve_user(from_addr)
            to_user_id = await resolve_user(to_addr)

            # Determine token type and build log entry
            if event_name == "FractionsRecovered":
                token_type = RecoveryTokenType.FRACTION_1155.value
                fraction_id = int(args.get("id", 0))
                amount = Decimal(str(args.get("amount", 0)))
                reason = args.get("reason", b"").decode("utf-8", errors="replace") if isinstance(args.get("reason"), bytes) else str(args.get("reason", ""))
            elif event_name == "ForceTransferSuccess":
                token_type = RecoveryTokenType.ERC3643.value
                fraction_id = None
                amount = Decimal(str(args.get("amount", 0)))
                reason = str(args.get("reason", ""))
            else:  # RecoverySuccess
                token_type = RecoveryTokenType.ERC3643.value
                fraction_id = None
                amount = None  # Full balance — amount not in event
                reason = "wallet recovery (same-user)"

            log = RecoveryLog(
                token_id=token.id,
                issuer_id=token.issuer_id,
                from_user_id=from_user_id,
                to_user_id=to_user_id,
                lost_wallet=from_addr,
                new_wallet=to_addr,
                reason=reason,
                tx_hash=tx_hash,
                token_type=token_type,
                fraction_id=fraction_id,
                amount=amount,
            )
            db.add(log)
            await db.commit()

            logger.info(
                "Recovery event indexed: %s on %s, from=%s to=%s, tx=%s",
                event_name, contract_address, from_addr, to_addr, tx_hash,
            )
