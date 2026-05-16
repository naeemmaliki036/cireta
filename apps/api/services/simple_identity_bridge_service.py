"""Simple Identity Bridge Service — whitelist-based on-chain identity.

Instead of deploying ONCHAINID contracts and signing claims, this service
simply adds/removes wallet addresses from a SimpleIdentityRegistry whitelist.

After Sumsub approves an investor:
1. Get all investor wallets
2. Call registry.addToWhitelist(wallet, countryCode) for each
3. Mark wallets as registered_on_chain in DB

To switch to full ERC-3643: set IDENTITY_MODE=erc3643 in env.
See docs/IDENTITY_MODE_SWITCHOVER.md for full migration guide.
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from eth_account import Account
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3

from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.config import settings
from packages.common.utils.iso3166 import alpha2_to_numeric, is_known_country

logger = logging.getLogger(__name__)

# Minimal ABI for SimpleIdentityRegistry
SIMPLE_REGISTRY_ABI = [
    {
        "inputs": [
            {"name": "wallet", "type": "address"},
            {"name": "country", "type": "uint16"},
        ],
        "name": "addToWhitelist",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "wallet", "type": "address"}],
        "name": "removeFromWhitelist",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "wallets", "type": "address[]"},
            {"name": "countries", "type": "uint16[]"},
        ],
        "name": "batchAddToWhitelist",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "wallets", "type": "address[]"}],
        "name": "batchRemoveFromWhitelist",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "userAddress", "type": "address"}],
        "name": "isVerified",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

class SimpleIdentityBridgeService:
    """Whitelist-based identity bridge — adds wallets to SimpleIdentityRegistry."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _get_w3_and_signer(self) -> tuple[Web3, Account]:
        """Get Web3 instance and signer account."""
        signer_key = settings.identity_signer_private_key
        if not signer_key:
            raise ValueError("IDENTITY_SIGNER_PRIVATE_KEY not configured")
        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        signer = Account.from_key(signer_key)
        return w3, signer

    def _get_country_code(self, user: User) -> int:
        """Resolve the user's stored alpha-2 country code to ISO-3166 numeric.

        Falls back to 0 (UNKNOWN_COUNTRY) when the user has no country or the
        alpha-2 isn't in the canonical table. Logs a warning in that case so
        the missing data surfaces in observability — code 0 is "system"
        on-chain and should not be silently used for a real investor.
        """
        code = getattr(user, "country_code", None) or ""
        if not is_known_country(code):
            logger.warning(
                "User %s has missing/unknown country_code=%r — registering with code 0; "
                "country-based compliance checks may not behave as expected.",
                getattr(user, "id", "?"),
                code,
            )
        return alpha2_to_numeric(code)

    async def is_whitelisted_on_chain(self, wallet_address: str) -> bool:
        """Read SimpleIdentityRegistry.isVerified(addr) from chain.

        This is the canonical "is this wallet on the whitelist right now"
        check. The DB ``Wallet.registered_on_chain`` flag is just a cache
        of this read; whenever we have a chance to reconcile, we should.

        Returns False on any RPC error so callers fall back to the
        existing add path (the contract will no-op via the ``if (!_whitelist[wallet])``
        guard inside addToWhitelist anyway).
        """
        registry_address = settings.identity_registry_address
        if not registry_address:
            return False
        try:
            import asyncio

            w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
            registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)
            return await asyncio.to_thread(
                registry.functions.isVerified(wallet_address).call
            )
        except Exception as exc:
            logger.warning(
                "is_whitelisted_on_chain RPC failed for %s: %s — assuming False",
                wallet_address, exc,
            )
            return False

    async def provision_identity(self, user_id: UUID) -> dict:
        """Whitelist all of the user's wallets in the SimpleIdentityRegistry.

        Args:
            user_id: The user whose wallets to whitelist.

        Returns:
            dict with:
              - registered_wallets: list of address strings
              - already_provisioned: bool
              - tx_hash: the on-chain tx hash (None if no write was
                needed, i.e. all wallets were already whitelisted)
        """
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        if user.kyc_status != "approved":
            raise ValueError("User KYC not approved")

        # Get all wallets
        wallet_result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id)
        )
        wallets = list(wallet_result.scalars().all())
        if not wallets:
            raise ValueError("No wallets linked")

        # Reconcile each wallet's DB flag against the on-chain whitelist
        # before deciding what to write. Catches the case where a wallet
        # was added directly (emergency manual flow, admin-side direct
        # call, prior environment) and the DB cache is stale.
        candidates = [w for w in wallets if not w.registered_on_chain]
        to_register: list[Wallet] = []
        reconciled = False
        for w in candidates:
            on_chain = await self.is_whitelisted_on_chain(w.address_checksum)
            if on_chain:
                w.registered_on_chain = True
                reconciled = True
                logger.info(
                    "provision_identity: wallet %s already whitelisted on-chain, reconciled",
                    w.address_checksum,
                )
            else:
                to_register.append(w)
        if reconciled:
            await self.db.commit()

        if not to_register:
            logger.info("All wallets already registered for user %s", user_id)
            return {
                "registered_wallets": [w.address_checksum for w in wallets],
                "already_provisioned": True,
                "tx_hash": None,
            }

        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)
        country_code = self._get_country_code(user)

        registered = []
        tx_hash: str | None = None

        if len(to_register) == 1:
            # Single wallet — direct call
            wallet = to_register[0]
            tx_hash = await self._add_to_whitelist(w3, signer, registry, wallet.address_checksum, country_code)
            wallet.registered_on_chain = True
            wallet.register_tx_hash = tx_hash
            wallet.registered_at = datetime.now(UTC)
            registered.append(wallet.address_checksum)
        else:
            # Multiple wallets — batch call (saves gas). All wallets in the
            # batch share the same tx_hash and registered_at — they were
            # confirmed in the same block.
            addresses = [w.address_checksum for w in to_register]
            countries = [country_code] * len(addresses)
            tx_hash = await self._batch_add(w3, signer, registry, addresses, countries)
            now = datetime.now(UTC)
            for w in to_register:
                w.registered_on_chain = True
                w.register_tx_hash = tx_hash
                w.registered_at = now
                registered.append(w.address_checksum)

        await self.db.commit()

        logger.info(
            "Whitelisted %d wallet(s) for user %s (tx=%s)",
            len(registered), user_id, tx_hash,
        )

        return {
            "registered_wallets": registered,
            "already_provisioned": False,
            "tx_hash": tx_hash,
        }

    async def register_wallet(self, user: User, wallet_address: str) -> dict:
        """Register a single wallet on-chain for an already-verified user.

        Called by WalletService when a verified user links a new wallet.

        First checks ``isVerified(addr)`` on chain — if the wallet is
        already whitelisted (e.g. via the emergency manual flow or some
        other path), the call is a no-op and we just reconcile the DB
        flag so the UI shows the correct state. The contract itself
        ALSO no-ops on a duplicate add via the ``if (!_whitelist[wallet])``
        guard inside addToWhitelist, but we'd rather skip the gas + tx
        round-trip when we can.

        Returns:
            dict with ``tx_hash`` (None if the wallet was already
            whitelisted on chain and no write was needed).
        """
        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        # Pre-flight on-chain check — skip the write if the wallet is
        # already whitelisted from any prior path (worker, emergency
        # manual, or admin-side direct call).
        if await self.is_whitelisted_on_chain(wallet_address):
            logger.info(
                "Wallet %s already whitelisted on-chain — skipping add and reconciling DB",
                wallet_address,
            )
            await self._reconcile_wallet_flag(wallet_address, registered=True)
            return {"tx_hash": None, "already_whitelisted": True}

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)
        country_code = self._get_country_code(user)

        tx_hash = await self._add_to_whitelist(w3, signer, registry, wallet_address, country_code)
        await self._reconcile_wallet_flag(wallet_address, registered=True, tx_hash=tx_hash)
        logger.info("Whitelisted wallet %s for user %s (tx=%s)", wallet_address, user.id, tx_hash)
        return {"tx_hash": tx_hash, "already_whitelisted": False}

    async def _reconcile_wallet_flag(
        self,
        wallet_address: str,
        *,
        registered: bool,
        tx_hash: str | None = None,
    ) -> None:
        """Flip Wallet.registered_on_chain to match the on-chain truth.

        Used after every register/revoke call (and when the on-chain
        check finds a wallet is already in the desired state) so the DB
        cache stays in sync without requiring the caller to commit.

        When tx_hash is supplied (i.e. we just signed the addToWhitelist
        ourselves), also persist register_tx_hash + registered_at as proof.
        """
        from web3 import Web3 as _W3

        try:
            checksum = _W3.to_checksum_address(wallet_address)
        except Exception:
            checksum = wallet_address
        wallet_q = await self.db.execute(
            select(Wallet).where(Wallet.address_checksum == checksum)
        )
        wallet = wallet_q.scalar_one_or_none()
        if not wallet:
            return
        dirty = False
        if wallet.registered_on_chain != registered:
            wallet.registered_on_chain = registered
            dirty = True
        if registered and tx_hash and not wallet.register_tx_hash:
            wallet.register_tx_hash = tx_hash
            wallet.registered_at = datetime.now(UTC)
            dirty = True
        if dirty:
            await self.db.commit()

    async def revoke_wallet(self, wallet_address: str) -> dict:
        """Remove a wallet from the whitelist (KYC revoked or wallet unlinked).

        Pre-flight on-chain check: if the wallet isn't whitelisted right
        now, the call is a no-op and we just reconcile the DB flag.

        Returns:
            dict with ``tx_hash`` (None if the wallet was already not on
            the whitelist).
        """
        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        if not await self.is_whitelisted_on_chain(wallet_address):
            logger.info(
                "Wallet %s already not on whitelist — skipping revoke and reconciling DB",
                wallet_address,
            )
            await self._reconcile_wallet_flag(wallet_address, registered=False)
            return {"tx_hash": None, "already_revoked": True}

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)

        # Use EIP-1559 gas pricing with dynamic estimation for whitelist removal
        try:
            # Get latest block for base fee calculation
            latest = await asyncio.to_thread(w3.eth.get_block, "latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority
                max_fee_per_gas = base_fee * 3 + max_priority_fee

                tx = registry.functions.removeFromWhitelist(wallet_address).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
                tx = registry.functions.removeFromWhitelist(wallet_address).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer
            try:
                estimated_gas = await asyncio.to_thread(w3.eth.estimate_gas, tx)
                buffered_gas = max(int(estimated_gas * 1.2), 80_000)  # 20% buffer, min 80k
                tx["gas"] = min(buffered_gas, 300_000)  # Cap at 300k
            except Exception:
                tx["gas"] = 120_000  # Safe fallback

        except Exception:
            # Complete fallback to legacy
            tx = registry.functions.removeFromWhitelist(wallet_address).build_transaction({
                "from": signer.address,
                "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                "gas": 120_000,
                "gasPrice": await asyncio.to_thread(lambda: w3.eth.gas_price),
            })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"removeFromWhitelist failed: {tx_hash.hex()}")

        tx_hash_str = f"0x{tx_hash.hex()}" if not tx_hash.hex().startswith("0x") else tx_hash.hex()
        await self._reconcile_wallet_flag(wallet_address, registered=False)
        logger.info("Removed wallet %s from whitelist (tx=%s)", wallet_address, tx_hash_str)
        return {"tx_hash": tx_hash_str, "already_revoked": False}

    async def revoke_all_wallets(self, user_id: UUID) -> None:
        """Remove all of a user's wallets from the whitelist."""
        wallet_result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.registered_on_chain.is_(True))
        )
        wallets = list(wallet_result.scalars().all())
        if not wallets:
            return

        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)

        addresses = [w.address_checksum for w in wallets]

        # Use EIP-1559 gas pricing with dynamic estimation for batch removal
        try:
            # Get latest block for base fee calculation
            latest = await asyncio.to_thread(w3.eth.get_block, "latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority
                max_fee_per_gas = base_fee * 3 + max_priority_fee

                tx = registry.functions.batchRemoveFromWhitelist(addresses).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
                tx = registry.functions.batchRemoveFromWhitelist(addresses).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer
            try:
                estimated_gas = await asyncio.to_thread(w3.eth.estimate_gas, tx)
                buffered_gas = max(int(estimated_gas * 1.2), 100_000 + len(addresses) * 30_000)  # Base + per address
                tx["gas"] = min(buffered_gas, 2_000_000)  # Cap at 2M for large batches
            except Exception:
                # Fallback: conservative estimate
                tx["gas"] = min(100_000 + len(addresses) * 50_000, 2_000_000)

        except Exception:
            # Complete fallback to legacy
            tx = registry.functions.batchRemoveFromWhitelist(addresses).build_transaction({
                "from": signer.address,
                "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                "gas": min(100_000 + len(addresses) * 50_000, 2_000_000),
                "gasPrice": await asyncio.to_thread(lambda: w3.eth.gas_price),
            })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"batchRemoveFromWhitelist failed: {tx_hash.hex()}")

        for w in wallets:
            w.registered_on_chain = False
        await self.db.commit()

        logger.info("Removed %d wallets from whitelist for user %s", len(addresses), user_id)

    # ============ Internal ============

    async def _add_to_whitelist(
        self, w3: Web3, signer: Account, registry, wallet_address: str, country_code: int
    ) -> str:
        """Sign + send addToWhitelist with modern EIP-1559 gas handling."""
        nonce = await asyncio.to_thread(w3.eth.get_transaction_count, signer.address)

        # Get latest block for EIP-1559 gas pricing
        latest_block = await asyncio.to_thread(w3.eth.get_block, "latest")
        base_fee = getattr(latest_block, 'baseFeePerGas', None)

        # Build transaction with EIP-1559 or legacy fallback
        if base_fee is not None:
            # EIP-1559 transaction
            max_priority_fee = 2_000_000_000  # 2 gwei priority
            max_fee_per_gas = base_fee * 3 + max_priority_fee

            tx = registry.functions.addToWhitelist(wallet_address, country_code).build_transaction({
                "from": signer.address,
                "nonce": nonce,
                "gas": 200_000,  # Conservative initial gas limit
                "maxFeePerGas": max_fee_per_gas,
                "maxPriorityFeePerGas": max_priority_fee,
                "type": 2,  # EIP-1559 transaction type
            })
        else:
            # Legacy transaction fallback
            gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
            tx = registry.functions.addToWhitelist(wallet_address, country_code).build_transaction({
                "from": signer.address,
                "nonce": nonce,
                "gas": 200_000,
                "gasPrice": gas_price,
            })

        # Estimate gas and add 20% buffer
        try:
            estimated_gas = await asyncio.to_thread(w3.eth.estimate_gas, tx)
            buffered_gas = max(int(estimated_gas * 1.2), 100_000)  # 20% buffer, min 100k
            tx["gas"] = min(buffered_gas, 500_000)  # Cap at 500k
            logger.info(f"addToWhitelist gas: estimated={estimated_gas}, buffered={buffered_gas}, final={tx['gas']}")
        except Exception as gas_error:
            logger.warning(f"Gas estimation failed for addToWhitelist: {gas_error}, using fallback")
            tx["gas"] = 150_000  # Safe fallback

        signed = signer.sign_transaction(tx)
        tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.raw_transaction)
        receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"addToWhitelist failed: {tx_hash.hex()}")
        return f"0x{tx_hash.hex()}" if not tx_hash.hex().startswith("0x") else tx_hash.hex()

    async def _batch_add(
        self, w3: Web3, signer: Account, registry,
        addresses: list[str], countries: list[int],
    ) -> str:
        """Sign + send batchAddToWhitelist with EIP-1559 gas pricing. Returns the tx hash as 0x-prefixed hex."""
        # Use EIP-1559 gas pricing with dynamic estimation for batch addition
        try:
            # Get latest block for base fee calculation
            latest = await asyncio.to_thread(w3.eth.get_block, "latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority
                max_fee_per_gas = base_fee * 3 + max_priority_fee

                tx = registry.functions.batchAddToWhitelist(addresses, countries).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
                tx = registry.functions.batchAddToWhitelist(addresses, countries).build_transaction({
                    "from": signer.address,
                    "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer
            try:
                estimated_gas = await asyncio.to_thread(w3.eth.estimate_gas, tx)
                buffered_gas = max(int(estimated_gas * 1.2), 150_000 + len(addresses) * 50_000)  # Base + per address
                tx["gas"] = min(buffered_gas, 3_000_000)  # Cap at 3M for large batches
            except Exception:
                # Fallback: conservative estimate
                tx["gas"] = min(150_000 + len(addresses) * 80_000, 3_000_000)

        except Exception:
            # Complete fallback to legacy
            tx = registry.functions.batchAddToWhitelist(addresses, countries).build_transaction({
                "from": signer.address,
                "nonce": await asyncio.to_thread(w3.eth.get_transaction_count, signer.address),
                "gas": min(150_000 + len(addresses) * 80_000, 3_000_000),
                "gasPrice": await asyncio.to_thread(lambda: w3.eth.gas_price),
            })

        signed = signer.sign_transaction(tx)
        tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.raw_transaction)
        receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"batchAddToWhitelist failed: {tx_hash.hex()}")
        return f"0x{tx_hash.hex()}" if not tx_hash.hex().startswith("0x") else tx_hash.hex()
