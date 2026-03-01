"""Web3 service for blockchain interactions.

Handles ERC-3643 token deployment and on-chain operations on Base L2.
Chain ID: 8453 (Base Mainnet)
"""

from decimal import Decimal
from typing import Any

from eth_account import Account
from eth_account.signers.local import LocalAccount
from web3 import Web3
from web3.types import TxReceipt

from packages.common.core.config import settings


class Web3Service:
    """Service for blockchain operations.

    Handles:
    - ERC-3643 token deployment
    - Transaction signing and sending
    - Contract interactions
    - Identity registry operations
    - Claim issuance
    """

    def __init__(self) -> None:
        """Initialize Web3 service with Base L2 connection."""
        self.w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        self.chain_id = settings.chain_id

        # Load deployer account if key configured
        self._account: LocalAccount | None = None
        if settings.deployer_private_key:
            self._account = Account.from_key(settings.deployer_private_key)

    @property
    def deployer_address(self) -> str | None:
        """Get deployer wallet address."""
        return self._account.address if self._account else None

    def is_connected(self) -> bool:
        """Check if connected to blockchain."""
        return self.w3.is_connected()

    def get_balance(self, address: str) -> Decimal:
        """Get ETH balance for an address.

        Args:
            address: Wallet address.

        Returns:
            Balance in ETH.
        """
        checksum_address = Web3.to_checksum_address(address)
        balance_wei = self.w3.eth.get_balance(checksum_address)
        return Decimal(str(Web3.from_wei(balance_wei, "ether")))

    def get_token_balance(
        self, contract_address: str, wallet_address: str, decimals: int = 18
    ) -> Decimal:
        """Get ERC-20 token balance.

        Args:
            contract_address: Token contract address.
            wallet_address: Wallet to check.
            decimals: Token decimals.

        Returns:
            Token balance.
        """
        # Minimal ERC-20 ABI for balanceOf
        abi = [
            {
                "inputs": [{"name": "account", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            }
        ]

        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address), abi=abi
        )
        balance = contract.functions.balanceOf(
            Web3.to_checksum_address(wallet_address)
        ).call()

        return Decimal(balance) / Decimal(10**decimals)

    async def send_transaction(
        self, to: str, value: int = 0, data: bytes = b""
    ) -> TxReceipt:
        """Send a raw transaction.

        Args:
            to: Destination address.
            value: Value in wei.
            data: Transaction data.

        Returns:
            Transaction receipt.

        Raises:
            ValueError: If no deployer account configured.
        """
        if not self._account:
            raise ValueError("No deployer account configured")

        checksum_to = Web3.to_checksum_address(to)
        nonce = self.w3.eth.get_transaction_count(self._account.address)
        gas_price = self.w3.eth.gas_price

        tx = {
            "chainId": self.chain_id,
            "to": checksum_to,
            "value": value,
            "gas": 500000,
            "gasPrice": gas_price,
            "nonce": nonce,
            "data": data,
        }

        # Estimate gas
        tx["gas"] = self.w3.eth.estimate_gas(tx)

        # Sign and send
        signed = self._account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

        # Wait for receipt
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    async def call_contract(
        self, contract_address: str, abi: list, function_name: str, *args: Any
    ) -> Any:
        """Call a contract view function.

        Args:
            contract_address: Contract address.
            abi: Contract ABI.
            function_name: Function to call.
            *args: Function arguments.

        Returns:
            Function return value.
        """
        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address), abi=abi
        )
        function = getattr(contract.functions, function_name)
        return function(*args).call()

    async def execute_contract(
        self, contract_address: str, abi: list, function_name: str, *args: Any
    ) -> TxReceipt:
        """Execute a contract state-changing function.

        Args:
            contract_address: Contract address.
            abi: Contract ABI.
            function_name: Function to call.
            *args: Function arguments.

        Returns:
            Transaction receipt.

        Raises:
            ValueError: If no deployer account configured.
        """
        if not self._account:
            raise ValueError("No deployer account configured")

        contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address), abi=abi
        )
        function = getattr(contract.functions, function_name)

        nonce = self.w3.eth.get_transaction_count(self._account.address)
        gas_price = self.w3.eth.gas_price

        tx = function(*args).build_transaction(
            {
                "chainId": self.chain_id,
                "from": self._account.address,
                "gas": 500000,
                "gasPrice": gas_price,
                "nonce": nonce,
            }
        )

        # Estimate gas
        tx["gas"] = self.w3.eth.estimate_gas(tx)

        # Sign and send
        signed = self._account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    async def deploy_erc3643_token(
        self,
        _name: str,
        _symbol: str,
        _decimals: int,
        _identity_registry: str,
        _compliance: str,
        _owner: str,
    ) -> tuple[str, TxReceipt]:
        """Deploy an ERC-3643 compliant token.

        TODO: Implement actual deployment using compiled bytecode.
        Currently returns placeholder for development.

        Args:
            name: Token name.
            symbol: Token symbol.
            decimals: Token decimals.
            identity_registry: Identity registry contract address.
            compliance: Compliance contract address.
            owner: Token owner address.

        Returns:
            Tuple of (contract_address, receipt).
        """
        # TODO: Load ERC-3643 bytecode and ABI from compiled contracts
        # For now, return placeholder
        placeholder_address = "0x" + "0" * 40

        # In production, this would:
        # 1. Load Token bytecode from contracts/artifacts
        # 2. Deploy Token contract
        # 3. Set up identity registry binding
        # 4. Configure compliance modules
        # 5. Return actual deployed address

        return placeholder_address, None  # type: ignore

    async def register_identity(
        self,
        identity_registry: str,
        user_address: str,
        identity_address: str,
        country: int,
    ) -> TxReceipt:
        """Register a user identity in the identity registry.

        Args:
            identity_registry: Identity registry contract address.
            user_address: User's wallet address.
            identity_address: ONCHAINID contract address.
            country: Country code.

        Returns:
            Transaction receipt.
        """
        # Identity Registry ABI for registerIdentity
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
        """Issue a claim to an ONCHAINID identity.

        Args:
            identity_address: ONCHAINID contract address.
            topic: Claim topic (e.g., KYC level).
            scheme: Signature scheme.
            issuer: Claim issuer address.
            signature: Claim signature.
            data: Claim data.
            uri: Claim URI.

        Returns:
            Transaction receipt.
        """
        # ONCHAINID ABI for addClaim
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

    async def freeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Freeze a wallet for a specific token.

        Args:
            token_address: Token contract address.
            wallet_address: Wallet to freeze.

        Returns:
            Transaction receipt.
        """
        abi = [
            {
                "inputs": [{"name": "_userAddress", "type": "address"}],
                "name": "setAddressFrozen",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        # ERC-3643 uses setAddressFrozen(address, true)
        return await self.execute_contract(
            token_address,
            [
                {
                    **abi[0],
                    "inputs": [
                        {"name": "_userAddress", "type": "address"},
                        {"name": "_freeze", "type": "bool"},
                    ],
                }
            ],
            "setAddressFrozen",
            Web3.to_checksum_address(wallet_address),
            True,
        )

    async def unfreeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Unfreeze a wallet for a specific token.

        Args:
            token_address: Token contract address.
            wallet_address: Wallet to unfreeze.

        Returns:
            Transaction receipt.
        """
        return await self.execute_contract(
            token_address,
            [
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
            ],
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
        """Execute a forced transfer (compliance action).

        Args:
            token_address: Token contract address.
            from_address: Source address.
            to_address: Destination address.
            amount: Amount in token units.

        Returns:
            Transaction receipt.
        """
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

    async def pause_token(self, token_address: str) -> TxReceipt:
        """Pause all transfers for a token.

        Args:
            token_address: Token contract address.

        Returns:
            Transaction receipt.
        """
        abi = [
            {
                "inputs": [],
                "name": "pause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        return await self.execute_contract(token_address, abi, "pause")

    async def unpause_token(self, token_address: str) -> TxReceipt:
        """Unpause transfers for a token.

        Args:
            token_address: Token contract address.

        Returns:
            Transaction receipt.
        """
        abi = [
            {
                "inputs": [],
                "name": "unpause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        return await self.execute_contract(token_address, abi, "unpause")


# Singleton instance
web3_service = Web3Service()
