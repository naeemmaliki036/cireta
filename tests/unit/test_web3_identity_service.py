"""Unit tests for Web3IdentityService — Sprint 3.

Tests: CREATE2 address computation, ECDSA claim signing,
full identity registration flow, and claim verification.
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from eth_abi import encode
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

from apps.api.services.web3_identity_service import (
    CLAIM_EXPIRY_SECONDS,
    CLAIM_TOPIC_COUNTRY,
    CLAIM_TOPIC_KYC,
    Web3IdentityService,
    _country_code_to_numeric,
)

# Test deployer key (DO NOT use in production)
TEST_PRIVATE_KEY = "0x" + "ab" * 32
TEST_DEPLOYER = Account.from_key(TEST_PRIVATE_KEY).address
TEST_FACTORY = "0x" + "11" * 20
TEST_WALLET = "0x" + "22" * 20
TEST_IDENTITY_REGISTRY = "0x" + "33" * 20


def _make_service() -> Web3IdentityService:
    """Create a service with mocked web3 and deployer."""
    with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
        mock_settings.web3_rpc_url = "http://localhost:8545"
        mock_settings.chain_id = 84532
        mock_settings.deployer_private_key = TEST_PRIVATE_KEY
        mock_settings.identity_factory_address = TEST_FACTORY
        mock_settings.identity_registry_address = TEST_IDENTITY_REGISTRY
        mock_settings.identity_init_code_hash = ""
        mock_settings.identity_proxy_bytecode = ""

        svc = Web3IdentityService.__new__(Web3IdentityService)
        svc.w3 = MagicMock()
        svc.chain_id = 84532
        svc._account = Account.from_key(TEST_PRIVATE_KEY)
        return svc


# ── Task 3.1: CREATE2 address computation ──────────────────────────


class TestCREATE2:
    """Tests for _compute_salt and _compute_identity_address."""

    def test_compute_salt_deterministic(self) -> None:
        """Same wallet always produces the same salt."""
        salt1 = Web3IdentityService._compute_salt(TEST_WALLET)
        salt2 = Web3IdentityService._compute_salt(TEST_WALLET)
        assert salt1 == salt2
        assert len(salt1) == 32

    def test_compute_salt_different_wallets(self) -> None:
        """Different wallets produce different salts."""
        salt1 = Web3IdentityService._compute_salt(TEST_WALLET)
        salt2 = Web3IdentityService._compute_salt("0x" + "33" * 20)
        assert salt1 != salt2

    def test_compute_identity_address_format(self) -> None:
        """CREATE2 address is valid checksummed Ethereum address."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            mock_settings.identity_init_code_hash = ""
            mock_settings.identity_proxy_bytecode = ""

            salt = Web3IdentityService._compute_salt(TEST_WALLET)
            addr = Web3IdentityService._compute_identity_address(TEST_WALLET, salt)

            assert addr.startswith("0x")
            assert len(addr) == 42
            assert Web3.is_checksum_address(addr)

    def test_compute_identity_address_deterministic(self) -> None:
        """Same inputs always produce the same address."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            mock_settings.identity_init_code_hash = ""
            mock_settings.identity_proxy_bytecode = ""

            salt = Web3IdentityService._compute_salt(TEST_WALLET)
            addr1 = Web3IdentityService._compute_identity_address(TEST_WALLET, salt)
            addr2 = Web3IdentityService._compute_identity_address(TEST_WALLET, salt)
            assert addr1 == addr2

    def test_compute_identity_address_with_init_code_hash(self) -> None:
        """Uses provided init_code_hash when available."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            fake_hash = Web3.keccak(b"test_init_code")
            mock_settings.identity_init_code_hash = fake_hash.hex()

            salt = Web3IdentityService._compute_salt(TEST_WALLET)
            addr = Web3IdentityService._compute_identity_address(
                TEST_WALLET, salt, init_code_hash=fake_hash
            )
            assert Web3.is_checksum_address(addr)

    def test_create2_formula_correctness(self) -> None:
        """Verify the CREATE2 formula matches the spec."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            fake_init_hash = Web3.keccak(b"some_init_code")

            salt = Web3IdentityService._compute_salt(TEST_WALLET)

            # Manual CREATE2 computation
            data = (
                b"\xff"
                + Web3.to_bytes(hexstr=TEST_FACTORY)
                + salt
                + fake_init_hash
            )
            expected = Web3.to_checksum_address(Web3.keccak(data)[-20:].hex())

            addr = Web3IdentityService._compute_identity_address(
                TEST_WALLET, salt, init_code_hash=fake_init_hash
            )
            assert addr == expected


# ── Task 3.2: ECDSA claim signing ──────────────────────────────────


class TestClaimSigning:
    """Tests for sign_claim with real ECDSA signatures."""

    def test_sign_claim_returns_valid_signature(self) -> None:
        """Signature is 65 bytes (r + s + v), returns 3-tuple with data_with_expiry."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.deployer_private_key = TEST_PRIVATE_KEY

            identity = "0x" + "aa" * 20
            sig, expiry, data_with_expiry = Web3IdentityService.sign_claim(identity, CLAIM_TOPIC_KYC, b"2")

            assert len(sig) == 65
            assert expiry > int(time.time())
            assert expiry <= int(time.time()) + CLAIM_EXPIRY_SECONDS + 5
            assert len(data_with_expiry) > 0

    def test_sign_claim_recovers_to_deployer(self) -> None:
        """Signature recovers to the deployer address."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.deployer_private_key = TEST_PRIVATE_KEY

            identity = Web3.to_checksum_address("0x" + "aa" * 20)
            data = b"2"
            sig, _expiry, data_with_expiry = Web3IdentityService.sign_claim(identity, CLAIM_TOPIC_KYC, data)

            # Rebuild the claim hash as the contract would (using data_with_expiry)
            claim_hash = Web3.keccak(
                encode(
                    ["address", "uint256", "bytes"],
                    [identity, CLAIM_TOPIC_KYC, data_with_expiry],
                )
            )
            signable = encode_defunct(primitive=claim_hash)
            recovered = Account.recover_message(signable, signature=sig)
            assert recovered == TEST_DEPLOYER

    def test_sign_claim_different_topics_different_sigs(self) -> None:
        """Different topics produce different signatures."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.deployer_private_key = TEST_PRIVATE_KEY

            identity = "0x" + "aa" * 20
            sig_kyc, _, _ = Web3IdentityService.sign_claim(identity, CLAIM_TOPIC_KYC, b"2")
            sig_country, _, _ = Web3IdentityService.sign_claim(
                identity, CLAIM_TOPIC_COUNTRY, b"US"
            )
            assert sig_kyc != sig_country

    def test_sign_claim_no_private_key_raises(self) -> None:
        """ValueError raised when no deployer key is configured."""
        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.deployer_private_key = ""

            with pytest.raises(ValueError, match="DEPLOYER_PRIVATE_KEY"):
                Web3IdentityService.sign_claim("0x" + "aa" * 20, 1, b"2")


# ── Task 3.3: Full registration flow ───────────────────────────────


class TestRegistrationFlow:
    """Tests for deploy_identity, register_identity, and full flow."""

    @pytest.mark.asyncio
    async def test_deploy_identity_idempotent(self) -> None:
        """If identity already deployed, return existing address without deploying."""
        svc = _make_service()

        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            mock_settings.identity_init_code_hash = ""
            mock_settings.identity_proxy_bytecode = ""

            # Mock get_code returns non-empty → already deployed
            svc.w3.eth.get_code = MagicMock(return_value=b"\x60\x80")
            svc.execute_contract = AsyncMock()

            result = await svc.deploy_identity(TEST_WALLET)

            # Should not have called execute_contract (no deployment)
            svc.execute_contract.assert_not_called()
            assert Web3.is_checksum_address(result)

    @pytest.mark.asyncio
    async def test_deploy_identity_deploys_when_not_exists(self) -> None:
        """Deploys identity when not yet deployed."""
        svc = _make_service()

        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            mock_settings.identity_init_code_hash = ""
            mock_settings.identity_proxy_bytecode = ""

            # Mock get_code returns empty → not deployed
            svc.w3.eth.get_code = MagicMock(return_value=b"")

            deployed_identity = "0x" + "dd" * 20
            log_data = bytes.fromhex("00" * 12 + "dd" * 20)
            mock_receipt = {
                "logs": [{"topics": [b"event_sig", b"indexed_wallet"], "data": log_data}],
                "status": 1,
            }
            svc.execute_contract = AsyncMock(return_value=mock_receipt)

            result = await svc.deploy_identity(TEST_WALLET)
            assert result == Web3.to_checksum_address(deployed_identity)
            svc.execute_contract.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_identity_idempotent(self) -> None:
        """Skip registration if wallet already registered."""
        svc = _make_service()
        svc.call_contract = AsyncMock(return_value=True)
        svc.execute_contract = AsyncMock()

        await svc.register_identity(
            TEST_IDENTITY_REGISTRY, TEST_WALLET, "0x" + "dd" * 20, 840
        )

        # Should not call execute_contract since already registered
        svc.execute_contract.assert_not_called()

    @pytest.mark.asyncio
    async def test_register_identity_new(self) -> None:
        """Register when wallet not yet registered."""
        svc = _make_service()
        svc.call_contract = AsyncMock(return_value=False)
        svc.execute_contract = AsyncMock(return_value={"status": 1})

        await svc.register_identity(
            TEST_IDENTITY_REGISTRY, TEST_WALLET, "0x" + "dd" * 20, 840
        )

        svc.execute_contract.assert_called_once()

    @pytest.mark.asyncio
    async def test_issue_kyc_claims_three_receipts(self) -> None:
        """Three claims issued: KYC, country, investor type."""
        svc = _make_service()

        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.deployer_private_key = TEST_PRIVATE_KEY

            svc.execute_contract = AsyncMock(return_value={"status": 1})

            receipts = await svc.issue_kyc_claims(
                onchain_id_address="0x" + "aa" * 20,
                kyc_level=2,
                country_code="US",
                investor_type="individual",
            )

            assert len(receipts) == 3
            assert svc.execute_contract.call_count == 3

    @pytest.mark.asyncio
    async def test_full_registration_flow(self) -> None:
        """Full flow: deploy → claims → register."""
        svc = _make_service()

        with patch("apps.api.services.web3_identity_service.settings") as mock_settings:
            mock_settings.identity_factory_address = TEST_FACTORY
            mock_settings.identity_registry_address = TEST_IDENTITY_REGISTRY
            mock_settings.identity_init_code_hash = ""
            mock_settings.identity_proxy_bytecode = ""
            mock_settings.deployer_private_key = TEST_PRIVATE_KEY

            # Identity not deployed yet
            svc.w3.eth.get_code = MagicMock(return_value=b"")

            log_data = bytes.fromhex("00" * 12 + "dd" * 20)
            deploy_receipt = {
                "logs": [{"topics": [b"sig", b"wallet"], "data": log_data}],
                "status": 1,
            }

            # Track calls
            call_count = 0

            async def mock_execute(*_args, **_kwargs):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return deploy_receipt  # deploy
                return {"status": 1}  # claims + register

            svc.execute_contract = mock_execute
            svc.call_contract = AsyncMock(return_value=False)  # not registered yet

            identity_addr = await svc.register_identity_full(
                wallet_address=TEST_WALLET,
                identity_registry=TEST_IDENTITY_REGISTRY,
                country_code="US",
                kyc_level=2,
                investor_type="individual",
            )

            assert Web3.is_checksum_address(identity_addr)
            # 1 deploy + 3 claims + 1 register = 5 calls
            assert call_count == 5


# ── Helpers ─────────────────────────────────────────────────────────


class TestHelpers:
    """Tests for module-level helpers."""

    def test_country_code_to_numeric_known(self) -> None:
        assert _country_code_to_numeric("US") == 840
        assert _country_code_to_numeric("GB") == 826
        assert _country_code_to_numeric("DE") == 276

    def test_country_code_to_numeric_unknown(self) -> None:
        assert _country_code_to_numeric("XX") == 0
        assert _country_code_to_numeric("ZZ") == 0

    def test_country_code_case_insensitive(self) -> None:
        assert _country_code_to_numeric("us") == 840
        assert _country_code_to_numeric("Gb") == 826
