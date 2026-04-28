"""Identity Bridge Service — bridges Sumsub KYC to on-chain ONCHAINID.

After Sumsub approves an investor:
1. Deploy ONCHAINID for investor (via OnchainIDFactory)
2. Sign KYC claim with Cireta's ClaimIssuer key
3. Add claim to investor's ONCHAINID
4. Register identity in shared IdentityRegistryStorage

This is the ONE backend service that uses a private key — the claim signer key.
All other on-chain actions are via dApp.
"""

import logging
from uuid import UUID

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3

from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Claim topics matching ClaimTopicsRegistry
CLAIM_TOPIC_KYC = 1
CLAIM_TOPIC_AML = 2


class IdentityBridgeService:
    """Bridges off-chain KYC verification to on-chain ERC-3643 identity."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def provision_identity(self, user_id: UUID) -> dict:
        """Provision on-chain identity for a KYC-approved user.

        Steps:
        1. Get user's primary wallet
        2. Deploy ONCHAINID via factory (if not already deployed)
        3. Sign KYC claim
        4. Add claim to ONCHAINID
        5. Register in IdentityRegistryStorage
        6. Save onchain_id_address to user

        Args:
            user_id: The user whose identity to provision.

        Returns:
            dict with onchain_id_address, claim_tx_hash, registration_tx_hash

        Raises:
            ValueError: If user not approved or no wallet linked.
        """
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("User not found")
        if user.kyc_status != "approved":
            raise ValueError("User KYC not approved")
        if user.onchain_id:
            logger.info("User %s already has ONCHAINID at %s", user_id, user.onchain_id)
            return {"onchain_id_address": user.onchain_id, "already_provisioned": True}

        # Get primary wallet
        wallet_result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.is_primary.is_(True))
        )
        wallet = wallet_result.scalar_one_or_none()
        if not wallet:
            raise ValueError("No primary wallet linked")

        investor_address = wallet.address_checksum

        # All on-chain operations happen via the claim signer key
        # This is the ONE private key the backend holds
        claim_signer_key = settings.claim_signer_private_key
        if not claim_signer_key:
            raise ValueError("CLAIM_SIGNER_PRIVATE_KEY not configured")

        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        signer = Account.from_key(claim_signer_key)

        logger.info(
            "Provisioning on-chain identity for user=%s wallet=%s",
            user_id, investor_address,
        )

        # Step 1: Deploy ONCHAINID via factory
        onchain_id_address = await self._deploy_onchain_id(w3, signer, investor_address)

        # Step 2: Sign KYC claim
        kyc_claim_sig, kyc_claim_data = self._sign_claim(
            signer, onchain_id_address, CLAIM_TOPIC_KYC
        )

        # Step 3: Add claim to ONCHAINID
        await self._add_claim_to_identity(
            w3, signer, onchain_id_address,
            CLAIM_TOPIC_KYC, kyc_claim_sig, kyc_claim_data,
        )

        # Step 4: Register ALL wallets in IdentityRegistryStorage
        country_code = self._get_country_code(user)
        all_wallets_result = await self.db.execute(
            select(Wallet).where(Wallet.user_id == user_id)
        )
        all_wallets = list(all_wallets_result.scalars().all())

        registered_wallets = []
        for w in all_wallets:
            try:
                await self._register_identity(
                    w3, signer, w.address_checksum, onchain_id_address, country_code
                )
                w.registered_on_chain = True
                registered_wallets.append(w.address_checksum)
            except Exception:
                logger.exception(
                    "Failed to register wallet %s for user %s",
                    w.address_checksum, user_id,
                )

        # Step 5: Save to DB
        user.onchain_id = onchain_id_address
        await self.db.commit()

        logger.info(
            "Identity provisioned: user=%s onchain_id=%s wallets_registered=%d/%d",
            user_id, onchain_id_address, len(registered_wallets), len(all_wallets),
        )

        return {
            "onchain_id_address": onchain_id_address,
            "investor_address": investor_address,
            "registered_wallets": registered_wallets,
            "already_provisioned": False,
        }

    async def register_wallet(self, user: "User", wallet_address: str) -> None:
        """Register a single wallet on-chain for an already-provisioned user.

        Called by WalletService when a verified user links a new wallet.
        """
        claim_signer_key = settings.claim_signer_private_key
        if not claim_signer_key:
            raise ValueError("CLAIM_SIGNER_PRIVATE_KEY not configured")

        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        signer = Account.from_key(claim_signer_key)
        country_code = self._get_country_code(user)

        await self._register_identity(
            w3, signer, wallet_address, user.onchain_id, country_code
        )
        logger.info(
            "Registered additional wallet %s for user %s (onchain_id=%s)",
            wallet_address, user.id, user.onchain_id,
        )

    async def _deploy_onchain_id(
        self, w3: Web3, signer: Account, investor_address: str
    ) -> str:
        """Deploy ONCHAINID for investor via OnchainIDFactory."""
        factory_address = settings.identity_factory_address
        if not factory_address:
            raise ValueError("IDENTITY_FACTORY_ADDRESS not configured")

        # Check if already deployed
        factory_abi = [
            {
                "inputs": [{"name": "wallet", "type": "address"}],
                "name": "getIdentity",
                "outputs": [{"name": "", "type": "address"}],
                "stateMutability": "view",
                "type": "function",
            },
            {
                "inputs": [{"name": "wallet", "type": "address"}],
                "name": "deployIdentity",
                "outputs": [{"name": "identity", "type": "address"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
        ]
        factory = w3.eth.contract(address=factory_address, abi=factory_abi)

        existing = factory.functions.getIdentity(investor_address).call()
        if existing != "0x" + "0" * 40:
            logger.info("ONCHAINID already exists at %s", existing)
            return existing

        # Deploy new - use EIP-1559 gas pricing with dynamic estimation
        try:
            # Get latest block for base fee calculation
            latest = w3.eth.get_block("latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority fee
                max_fee_per_gas = base_fee * 3 + max_priority_fee  # 3x base fee + priority

                tx = factory.functions.deployIdentity(investor_address).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = w3.eth.gas_price
                tx = factory.functions.deployIdentity(investor_address).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer for safety
            try:
                estimated_gas = w3.eth.estimate_gas(tx)
                # Add 20% buffer to estimated gas, with minimum of 300k for identity deployments
                buffered_gas = max(int(estimated_gas * 1.2), 300_000)
                tx["gas"] = min(buffered_gas, 1_500_000)  # Cap at 1.5M for safety
            except Exception:
                # Fallback gas limit for identity deployment
                tx["gas"] = 800_000

        except Exception:
            # Complete fallback to legacy gas pricing
            tx = factory.functions.deployIdentity(investor_address).build_transaction({
                "from": signer.address,
                "nonce": w3.eth.get_transaction_count(signer.address),
                "gas": 800_000,  # Conservative fallback
                "gasPrice": w3.eth.gas_price,
            })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"ONCHAINID deployment failed: {tx_hash.hex()}")

        # Get deployed address from factory
        identity_address = factory.functions.getIdentity(investor_address).call()
        logger.info("Deployed ONCHAINID at %s for %s", identity_address, investor_address)
        return identity_address

    def _sign_claim(
        self, signer: Account, identity_address: str, claim_topic: int
    ) -> tuple[bytes, bytes]:
        """Sign a claim for an identity.

        The signed message is: keccak256(abi.encode(identity, topic, data))
        Matching CiretaClaimIssuer.isClaimValid() verification.
        """
        # Claim data: current timestamp + topic as proof
        import time
        claim_data = Web3.solidity_keccak(
            ["string", "uint256", "uint256"],
            ["CIRETA_KYC_APPROVED", claim_topic, int(time.time())]
        )

        # The hash that isClaimValid reconstructs
        data_hash = Web3.solidity_keccak(
            ["address", "uint256", "bytes"],
            [identity_address, claim_topic, claim_data]
        )

        # Sign with EIP-191 prefix (matching ecrecover with \x19Ethereum Signed Message)
        message = encode_defunct(data_hash)
        signed = Account.sign_message(message, private_key=signer.key)

        return signed.signature, claim_data

    async def _add_claim_to_identity(
        self, w3: Web3, signer: Account,
        identity_address: str, claim_topic: int,
        signature: bytes, data: bytes,
    ) -> None:
        """Add a signed claim to an ONCHAINID contract."""
        claim_issuer_address = settings.claim_issuer_address
        if not claim_issuer_address:
            raise ValueError("CLAIM_ISSUER_ADDRESS not configured")

        identity_abi = [
            {
                "inputs": [
                    {"name": "topic", "type": "uint256"},
                    {"name": "scheme", "type": "uint256"},
                    {"name": "issuer", "type": "address"},
                    {"name": "signature", "type": "bytes"},
                    {"name": "data", "type": "bytes"},
                    {"name": "uri", "type": "string"},
                ],
                "name": "addClaim",
                "outputs": [{"name": "claimId", "type": "bytes32"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
        ]
        identity = w3.eth.contract(address=identity_address, abi=identity_abi)

        # Use EIP-1559 gas pricing with dynamic estimation for claim addition
        try:
            # Get latest block for base fee calculation
            latest = w3.eth.get_block("latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority fee
                max_fee_per_gas = base_fee * 3 + max_priority_fee  # 3x base fee + priority

                tx = identity.functions.addClaim(
                    claim_topic,
                    1,  # scheme: ECDSA
                    claim_issuer_address,
                    signature,
                    data,
                    "https://cireta.com/kyc/verified",
                ).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = w3.eth.gas_price
                tx = identity.functions.addClaim(
                    claim_topic,
                    1,  # scheme: ECDSA
                    claim_issuer_address,
                    signature,
                    data,
                    "https://cireta.com/kyc/verified",
                ).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer for safety
            try:
                estimated_gas = w3.eth.estimate_gas(tx)
                # Add 20% buffer to estimated gas, with minimum of 150k for claim operations
                buffered_gas = max(int(estimated_gas * 1.2), 150_000)
                tx["gas"] = min(buffered_gas, 500_000)  # Cap at 500k for safety
            except Exception:
                # Fallback gas limit for claim addition
                tx["gas"] = 250_000

        except Exception:
            # Complete fallback to legacy gas pricing
            tx = identity.functions.addClaim(
                claim_topic,
                1,  # scheme: ECDSA
                claim_issuer_address,
                signature,
                data,
                "https://cireta.com/kyc/verified",
            ).build_transaction({
                "from": signer.address,
                "nonce": w3.eth.get_transaction_count(signer.address),
                "gas": 250_000,  # Conservative fallback
                "gasPrice": w3.eth.gas_price,
            })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"addClaim failed: {tx_hash.hex()}")

        logger.info("Claim added to ONCHAINID %s topic=%d", identity_address, claim_topic)

    async def _register_identity(
        self, w3: Web3, signer: Account,
        investor_address: str, identity_address: str, country_code: int,
    ) -> None:
        """Register investor identity in shared IdentityRegistryStorage."""
        storage_address = settings.identity_registry_address
        if not storage_address:
            raise ValueError("IDENTITY_REGISTRY_ADDRESS not configured")

        storage_abi = [
            {
                "inputs": [
                    {"name": "investorAddress", "type": "address"},
                    {"name": "identity", "type": "address"},
                    {"name": "country", "type": "uint16"},
                ],
                "name": "addIdentityToStorage",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            },
        ]
        storage = w3.eth.contract(address=storage_address, abi=storage_abi)

        # Use EIP-1559 gas pricing with dynamic estimation for identity registration
        try:
            # Get latest block for base fee calculation
            latest = w3.eth.get_block("latest")
            base_fee = latest.get("baseFeePerGas", 0)

            if base_fee > 0:  # EIP-1559 network
                max_priority_fee = 2_000_000_000  # 2 gwei priority fee
                max_fee_per_gas = base_fee * 3 + max_priority_fee  # 3x base fee + priority

                tx = storage.functions.addIdentityToStorage(
                    investor_address, identity_address, country_code
                ).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "maxFeePerGas": max_fee_per_gas,
                    "maxPriorityFeePerGas": max_priority_fee,
                })
            else:  # Legacy network fallback
                gas_price = w3.eth.gas_price
                tx = storage.functions.addIdentityToStorage(
                    investor_address, identity_address, country_code
                ).build_transaction({
                    "from": signer.address,
                    "nonce": w3.eth.get_transaction_count(signer.address),
                    "gasPrice": gas_price,
                })

            # Estimate gas and add 20% buffer for safety
            try:
                estimated_gas = w3.eth.estimate_gas(tx)
                # Add 20% buffer to estimated gas, with minimum of 100k for registry operations
                buffered_gas = max(int(estimated_gas * 1.2), 100_000)
                tx["gas"] = min(buffered_gas, 400_000)  # Cap at 400k for safety
            except Exception:
                # Fallback gas limit for identity registration
                tx["gas"] = 200_000

        except Exception:
            # Complete fallback to legacy gas pricing
            tx = storage.functions.addIdentityToStorage(
                investor_address, identity_address, country_code
            ).build_transaction({
                "from": signer.address,
                "nonce": w3.eth.get_transaction_count(signer.address),
                "gas": 200_000,  # Conservative fallback
                "gasPrice": w3.eth.gas_price,
            })
        signed = signer.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt["status"] != 1:
            raise RuntimeError(f"registerIdentity failed: {tx_hash.hex()}")

        logger.info("Identity registered: %s → %s country=%d", investor_address, identity_address, country_code)

    def _get_country_code(self, user: User) -> int:
        """Get ISO 3166-1 numeric country code from user's country_code field."""
        # Map common alpha-2 codes to numeric. Default to 0 (unknown).
        country_map = {
            "AE": 784, "US": 840, "GB": 826, "DE": 276, "FR": 250,
            "GH": 288, "TZ": 834, "CD": 180, "MA": 504, "NG": 566,
            "KE": 404, "ZA": 710, "IN": 356, "SG": 702, "HK": 344,
        }
        code = getattr(user, "country_code", None) or ""
        return country_map.get(code.upper(), 0)
