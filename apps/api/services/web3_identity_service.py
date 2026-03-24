"""Web3 identity service — ONCHAINID registration, claims, compliance actions.

Extends Web3TokenService with identity and compliance operations.
Implements CREATE2 address computation, real ECDSA claim signing,
and the full identity registration flow (deploy → claims → register).
"""

import asyncio
import logging
import time

from eth_abi import encode
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3
from web3.types import TxReceipt

from apps.api.services.web3_token_service import Web3TokenService
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# ONCHAINID claim topics
CLAIM_TOPIC_KYC = 1
CLAIM_TOPIC_COUNTRY = 2
CLAIM_TOPIC_INVESTOR_TYPE = 3

# ECDSA scheme identifier for ONCHAINID
CLAIM_SCHEME_ECDSA = 1

# Default claim validity: 365 days
CLAIM_EXPIRY_SECONDS = 365 * 24 * 60 * 60


def _build_identity_proxy_init_code(factory: str, wallet: str) -> bytes:
    """Build the init code for ONCHAINID's IdentityProxy.

    The ONCHAINID factory deploys proxies via CREATE2 with constructor args
    (address implementationAuthority, address initialManagementKey).
    The init code = proxy creation bytecode + abi-encoded constructor args.

    If IDENTITY_PROXY_BYTECODE is set in config, use that. Otherwise
    use the standard ONCHAINID IdentityProxy bytecode constant.
    """
    bytecode_hex = getattr(settings, "identity_proxy_bytecode", "")
    creation_code = bytes.fromhex(bytecode_hex.removeprefix("0x")) if bytecode_hex else b""

    constructor_args = encode(
        ["address", "address"],
        [Web3.to_checksum_address(factory), Web3.to_checksum_address(wallet)],
    )
    return creation_code + constructor_args


class Web3IdentityService(Web3TokenService):
    """Identity registry and compliance operations."""

    # ── Identity deployment ────────────────────────────────────────────

    async def deploy_identity(self, wallet_address: str) -> str:
        """Deploy an ONCHAINID identity contract for a user via IdentityFactory.

        Uses createIdentityWithSalt for deterministic (CREATE2) deployment.
        Idempotent: returns existing address if already deployed.

        Args:
            wallet_address: The user's wallet address.

        Returns:
            The deployed identity contract address.

        Raises:
            ValueError: If identity_factory_address is not configured.
        """
        if not settings.identity_factory_address:
            raise ValueError("IDENTITY_FACTORY_ADDRESS not configured")

        checksum = Web3.to_checksum_address(wallet_address)
        salt = self._compute_salt(checksum)

        # Check if already deployed at the expected address
        expected = self._compute_identity_address(checksum, salt)
        code = await asyncio.to_thread(self.w3.eth.get_code, expected)
        if code and code not in (b"", b"\x00"):
            logger.info(
                "Identity already deployed at %s for wallet %s", expected, checksum
            )
            return expected

        abi = [
            {
                "inputs": [
                    {"name": "_wallet", "type": "address"},
                    {"name": "_salt", "type": "bytes32"},
                ],
                "name": "createIdentityWithSalt",
                "outputs": [{"name": "", "type": "address"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        receipt = await self.execute_contract(
            settings.identity_factory_address,
            abi,
            "createIdentityWithSalt",
            checksum,
            salt,
        )

        # Extract deployed identity address from logs
        # The IdentityCreated event emits: (address indexed wallet, address identity)
        for log in receipt.get("logs", []):
            if len(log.get("topics", [])) >= 2:
                identity_address = Web3.to_checksum_address(
                    "0x" + log["data"].hex()[-40:]
                )
                return identity_address

        # Fallback: use pre-computed CREATE2 address
        return expected

    # ── CREATE2 address computation ────────────────────────────────────

    @staticmethod
    def _compute_salt(wallet_address: str) -> bytes:
        """Derive deterministic salt from wallet address."""
        return Web3.keccak(
            Web3.to_bytes(hexstr=Web3.to_checksum_address(wallet_address))
        )

    @staticmethod
    def _compute_identity_address(
        wallet_address: str,
        salt: bytes,
        init_code_hash: bytes | None = None,
    ) -> str:
        """Compute CREATE2 address for identity contract.

        Formula: keccak256(0xff ++ factory ++ salt ++ keccak256(init_code))

        Args:
            wallet_address: User's wallet address.
            salt: The 32-byte salt (keccak256 of wallet address).
            init_code_hash: keccak256 of the proxy init code deployed by the factory.
                If not provided, reads from IDENTITY_INIT_CODE_HASH setting
                or builds from proxy bytecode + constructor args.

        Returns:
            Checksummed CREATE2 address.
        """
        factory = Web3.to_checksum_address(settings.identity_factory_address)

        if init_code_hash is None:
            hash_hex = getattr(settings, "identity_init_code_hash", "")
            if hash_hex:
                init_code_hash = bytes.fromhex(hash_hex.removeprefix("0x"))
            else:
                init_code = _build_identity_proxy_init_code(factory, wallet_address)
                init_code_hash = Web3.keccak(init_code)

        # CREATE2: keccak256(0xff ++ deployer ++ salt ++ keccak256(init_code))
        data = b"\xff" + Web3.to_bytes(hexstr=factory) + salt + init_code_hash
        addr_hash = Web3.keccak(data)
        return Web3.to_checksum_address(addr_hash[-20:].hex())

    # ── Identity registration ──────────────────────────────────────────

    async def register_identity(
        self,
        identity_registry: str,
        user_address: str,
        identity_address: str,
        country: int,
    ) -> TxReceipt:
        """Register a user identity in the ERC-3643 identity registry.

        Idempotent: checks if already registered before attempting.
        """
        # Check if already registered
        is_verified = await self._is_identity_registered(
            identity_registry, user_address
        )
        if is_verified:
            logger.info(
                "Wallet %s already registered in IdentityRegistry %s",
                user_address,
                identity_registry,
            )
            return {}  # type: ignore[return-value]

        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_identity", "type": "address"},
                    {"name": "_country", "type": "uint16"},
                ],
                "name": "registerIdentity",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            identity_registry,
            abi,
            "registerIdentity",
            Web3.to_checksum_address(user_address),
            Web3.to_checksum_address(identity_address),
            country,
        )

    async def _is_identity_registered(
        self, identity_registry: str, user_address: str
    ) -> bool:
        """Check if a wallet is already registered in the identity registry."""
        try:
            return await self.call_contract(
                identity_registry,
                [
                    {
                        "inputs": [{"name": "_userAddress", "type": "address"}],
                        "name": "isVerified",
                        "outputs": [{"name": "", "type": "bool"}],
                        "stateMutability": "view",
                        "type": "function",
                    }
                ],
                "isVerified",
                Web3.to_checksum_address(user_address),
            )
        except Exception:
            return False

    # ── Claim signing (ECDSA) ──────────────────────────────────────────

    @staticmethod
    def sign_claim(
        identity_address: str,
        topic: int,
        data: bytes,
    ) -> tuple[bytes, int, bytes]:
        """Sign a claim using the deployer's private key (real ECDSA).

        ONCHAINID ClaimIssuer.isClaimValid() expects the signature to be
        an EIP-191 signed message of: keccak256(abi.encode(identity, topic, data)).
        The expiry is ABI-encoded into the data field so it is available
        on-chain for validity checks and included in the signed hash.

        Args:
            identity_address: The ONCHAINID identity contract address.
            topic: Claim topic (1=KYC, 2=Country, 3=InvestorType).
            data: Raw claim data bytes (value only, without expiry).

        Returns:
            Tuple of (signature_bytes, expiry_timestamp, data_with_expiry).
        """
        if not settings.deployer_private_key:
            raise ValueError("DEPLOYER_PRIVATE_KEY required for claim signing")

        expiry = int(time.time()) + CLAIM_EXPIRY_SECONDS

        # Encode expiry into the data field so it's available on-chain
        data_with_expiry = encode(["bytes", "uint256"], [data, expiry])

        # Build the claim hash including expiry for signature integrity
        claim_hash = Web3.keccak(
            encode(
                ["address", "uint256", "bytes"],
                [Web3.to_checksum_address(identity_address), topic, data_with_expiry],
            )
        )

        # Sign using EIP-191 (eth_sign style)
        signable = encode_defunct(primitive=claim_hash)
        signed = Account.sign_message(signable, private_key=settings.deployer_private_key)

        return bytes(signed.signature), expiry, data_with_expiry

    # ── Claim issuance ─────────────────────────────────────────────────

    async def issue_claim(
        self,
        identity_address: str,
        topic: int,
        scheme: int,
        issuer: str,
        signature: bytes,
        data: bytes,
        uri: str,
    ) -> TxReceipt:
        """Issue a claim to an ONCHAINID identity (KYC/AML attestation)."""
        abi = [
            {
                "inputs": [
                    {"name": "_topic", "type": "uint256"},
                    {"name": "_scheme", "type": "uint256"},
                    {"name": "_issuer", "type": "address"},
                    {"name": "_signature", "type": "bytes"},
                    {"name": "_data", "type": "bytes"},
                    {"name": "_uri", "type": "string"},
                ],
                "name": "addClaim",
                "outputs": [{"name": "claimRequestId", "type": "bytes32"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            identity_address,
            abi,
            "addClaim",
            topic,
            scheme,
            Web3.to_checksum_address(issuer),
            signature,
            data,
            uri,
        )

    async def issue_kyc_claims(
        self,
        onchain_id_address: str,
        kyc_level: int,
        country_code: str,
        investor_type: str,
    ) -> list[TxReceipt]:
        """Issue KYC, country, and investor type claims with real ECDSA signatures.

        Each claim includes an expiry (now + 365 days) and is signed with
        the deployer private key for compatibility with ClaimIssuer.isClaimValid().

        Args:
            onchain_id_address: The ONCHAINID identity contract address.
            kyc_level: KYC verification level (1, 2, etc.).
            country_code: ISO country code (e.g. "US", "GB").
            investor_type: Investor classification (e.g. "individual", "institutional").

        Returns:
            List of transaction receipts for the claim transactions.
        """
        deployer = self.deployer_address
        if not deployer:
            raise ValueError("No deployer account configured for claim issuance")

        issuer_addr = Web3.to_checksum_address(deployer)

        # Claim topics: 1=KYC level, 2=Country, 3=Investor type
        claims = [
            (CLAIM_TOPIC_KYC, str(kyc_level).encode()),
            (CLAIM_TOPIC_COUNTRY, country_code.encode()),
            (CLAIM_TOPIC_INVESTOR_TYPE, investor_type.encode()),
        ]

        receipts: list[TxReceipt] = []
        for topic, raw_data in claims:
            signature, _expiry, data_with_expiry = self.sign_claim(
                onchain_id_address, topic, raw_data
            )

            receipt = await self.issue_claim(
                identity_address=onchain_id_address,
                topic=topic,
                scheme=CLAIM_SCHEME_ECDSA,
                issuer=issuer_addr,
                signature=signature,
                data=data_with_expiry,
                uri="",
            )
            receipts.append(receipt)
            logger.info(
                "Claim issued: topic=%d identity=%s issuer=%s",
                topic,
                onchain_id_address,
                issuer_addr,
            )

        return receipts

    # ── Full registration flow ─────────────────────────────────────────

    async def register_identity_full(
        self,
        wallet_address: str,
        identity_registry: str,
        country_code: str = "XX",
        kyc_level: int = 2,
        investor_type: str = "individual",
    ) -> str:
        """Complete identity registration flow.

        1. Deploy ONCHAINID via factory (CREATE2, idempotent)
        2. Add KYC claim (topic 1) with real signature + expiry
        3. Add country claim (topic 2) with real signature + expiry
        4. Add investor type claim (topic 3) with real signature + expiry
        5. Register wallet → identity in IdentityRegistry

        Args:
            wallet_address: User's wallet address.
            identity_registry: IdentityRegistry contract address.
            country_code: ISO country code from KYC provider.
            kyc_level: KYC verification level.
            investor_type: "individual" or "institutional".

        Returns:
            The identity contract address.
        """
        checksum = Web3.to_checksum_address(wallet_address)

        # Step 1: Deploy ONCHAINID (idempotent)
        identity_address = await self.deploy_identity(checksum)
        logger.info(
            "ONCHAINID for %s: %s", checksum, identity_address
        )

        # Step 2-4: Issue claims with real ECDSA signatures
        await self.issue_kyc_claims(
            onchain_id_address=identity_address,
            kyc_level=kyc_level,
            country_code=country_code,
            investor_type=investor_type,
        )

        # Step 5: Register in IdentityRegistry
        # Country code to numeric: use a simple hash for now
        country_numeric = _country_code_to_numeric(country_code)
        await self.register_identity(
            identity_registry=identity_registry,
            user_address=checksum,
            identity_address=identity_address,
            country=country_numeric,
        )
        logger.info(
            "Registered %s → %s in IdentityRegistry %s",
            checksum,
            identity_address,
            identity_registry,
        )

        return identity_address

    # ── Compliance operations ──────────────────────────────────────────

    async def freeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Freeze a wallet address for a specific ERC-3643 token."""
        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_freeze", "type": "bool"},
                ],
                "name": "setAddressFrozen",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "setAddressFrozen",
            Web3.to_checksum_address(wallet_address),
            True,
        )

    async def unfreeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Unfreeze a wallet address for a specific ERC-3643 token."""
        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_freeze", "type": "bool"},
                ],
                "name": "setAddressFrozen",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "setAddressFrozen",
            Web3.to_checksum_address(wallet_address),
            False,
        )

    async def forced_transfer(
        self,
        token_address: str,
        from_address: str,
        to_address: str,
        amount: int,
    ) -> TxReceipt:
        """Execute a forced transfer (compliance / court order)."""
        abi = [
            {
                "inputs": [
                    {"name": "_from", "type": "address"},
                    {"name": "_to", "type": "address"},
                    {"name": "_amount", "type": "uint256"},
                ],
                "name": "forcedTransfer",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "forcedTransfer",
            Web3.to_checksum_address(from_address),
            Web3.to_checksum_address(to_address),
            amount,
        )


# ── Module-level helpers ──────────────────────────────────────────────

# ISO 3166-1 numeric codes for common countries
_COUNTRY_CODES: dict[str, int] = {
    "US": 840, "GB": 826, "DE": 276, "FR": 250, "JP": 392,
    "AU": 36, "CA": 124, "CH": 756, "SG": 702, "AE": 784,
    "HK": 344, "KR": 410, "NZ": 554, "IE": 372, "NL": 528,
    "SE": 752, "NO": 578, "DK": 208, "FI": 246, "AT": 40,
    "BE": 56, "LU": 442, "ES": 724, "IT": 380, "PT": 620,
}


def _country_code_to_numeric(code: str) -> int:
    """Convert ISO 3166-1 alpha-2 to numeric. Returns 0 for unknown."""
    return _COUNTRY_CODES.get(code.upper(), 0)
