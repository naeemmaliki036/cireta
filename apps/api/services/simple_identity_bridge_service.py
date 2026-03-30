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

import logging
from uuid import UUID

from eth_account import Account
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3

from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.config import settings

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

# Country code mapping (alpha-2 → numeric)
COUNTRY_MAP = {
    "AE": 784, "US": 840, "GB": 826, "DE": 276, "FR": 250,
    "GH": 288, "TZ": 834, "CD": 180, "MA": 504, "NG": 566,
    "KE": 404, "ZA": 710, "IN": 356, "SG": 702, "HK": 344,
}


class SimpleIdentityBridgeService:
    """Whitelist-based identity bridge — adds wallets to SimpleIdentityRegistry."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _get_w3_and_signer(self) -> tuple[Web3, Account]:
        """Get Web3 instance and signer account."""
        signer_key = settings.deployer_private_key
        if not signer_key:
            raise ValueError("DEPLOYER_PRIVATE_KEY not configured")
        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        signer = Account.from_key(signer_key)
        return w3, signer

    def _get_country_code(self, user: User) -> int:
        code = getattr(user, "country_code", None) or ""
        return COUNTRY_MAP.get(code.upper(), 0)

    async def provision_identity(self, user_id: UUID) -> dict:
        """Whitelist all of the user's wallets in the SimpleIdentityRegistry.

        Args:
            user_id: The user whose wallets to whitelist.

        Returns:
            dict with registered_wallets list and count.
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

        # Filter to only un-registered wallets
        to_register = [w for w in wallets if not w.registered_on_chain]
        if not to_register:
            logger.info("All wallets already registered for user %s", user_id)
            return {
                "registered_wallets": [w.address_checksum for w in wallets],
                "already_provisioned": True,
            }

        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)
        country_code = self._get_country_code(user)

        registered = []

        if len(to_register) == 1:
            # Single wallet — direct call
            wallet = to_register[0]
            await self._add_to_whitelist(w3, signer, registry, wallet.address_checksum, country_code)
            wallet.registered_on_chain = True
            registered.append(wallet.address_checksum)
        else:
            # Multiple wallets — batch call (saves gas)
            addresses = [w.address_checksum for w in to_register]
            countries = [country_code] * len(addresses)
            await self._batch_add(w3, signer, registry, addresses, countries)
            for w in to_register:
                w.registered_on_chain = True
                registered.append(w.address_checksum)

        await self.db.commit()

        logger.info(
            "Whitelisted %d wallet(s) for user %s",
            len(registered), user_id,
        )

        return {
            "registered_wallets": registered,
            "already_provisioned": False,
        }

    async def register_wallet(self, user: User, wallet_address: str) -> None:
        """Register a single wallet on-chain for an already-verified user.

        Called by WalletService when a verified user links a new wallet.
        """
        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)
        country_code = self._get_country_code(user)

        await self._add_to_whitelist(w3, signer, registry, wallet_address, country_code)
        logger.info("Whitelisted wallet %s for user %s", wallet_address, user.id)

    async def revoke_wallet(self, wallet_address: str) -> None:
        """Remove a wallet from the whitelist (KYC revoked or wallet unlinked)."""
        registry_address = settings.identity_registry_address
        if not registry_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        w3, signer = self._get_w3_and_signer()
        registry = w3.eth.contract(address=registry_address, abi=SIMPLE_REGISTRY_ABI)

        tx = registry.functions.removeFromWhitelist(wallet_address).build_transaction({
            "from": signer.address,
            "nonce": w3.eth.get_transaction_count(signer.address),
            "gas": 60_000,
            "gasPrice": w3.eth.gas_price,
        })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"removeFromWhitelist failed: {tx_hash.hex()}")

        logger.info("Removed wallet %s from whitelist", wallet_address)

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
        tx = registry.functions.batchRemoveFromWhitelist(addresses).build_transaction({
            "from": signer.address,
            "nonce": w3.eth.get_transaction_count(signer.address),
            "gas": 50_000 * len(addresses),
            "gasPrice": w3.eth.gas_price,
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
    ) -> None:
        tx = registry.functions.addToWhitelist(wallet_address, country_code).build_transaction({
            "from": signer.address,
            "nonce": w3.eth.get_transaction_count(signer.address),
            "gas": 80_000,
            "gasPrice": w3.eth.gas_price,
        })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"addToWhitelist failed: {tx_hash.hex()}")

    async def _batch_add(
        self, w3: Web3, signer: Account, registry,
        addresses: list[str], countries: list[int],
    ) -> None:
        tx = registry.functions.batchAddToWhitelist(addresses, countries).build_transaction({
            "from": signer.address,
            "nonce": w3.eth.get_transaction_count(signer.address),
            "gas": 80_000 * len(addresses),
            "gasPrice": w3.eth.gas_price,
        })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"batchAddToWhitelist failed: {tx_hash.hex()}")
