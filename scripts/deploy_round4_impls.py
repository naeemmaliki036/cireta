"""Deploy new Sale + IssuerOTCToken implementations and point factories at them.

Round-4 contract validation rollout. Reads compiled bytecode + ABI from
hardhat artifacts. Signs from ADMIN_PRIVATE_KEY (factory owner). Idempotent:
re-running redeploys fresh implementations and re-points the factories.
"""
import json
import os
import sys
from pathlib import Path
from web3 import Web3
from eth_account import Account

REPO = Path("/Users/mna036/ai-bytes/cireta-jawad")
ARTIFACTS = REPO / "contracts" / "artifacts" / "src"

RPC = os.environ.get("WEB3_RPC_URL")
if not RPC:
    raise SystemExit("Set WEB3_RPC_URL in env. Aborting.")
CHAIN_ID = int(os.environ.get("CHAIN_ID", "84532"))
ADMIN_KEY = os.environ.get("ADMIN_PRIVATE_KEY")
if not ADMIN_KEY:
    raise SystemExit("Set ADMIN_PRIVATE_KEY in env (factory owner). Aborting.")

SALE_FACTORY = Web3.to_checksum_address(
    os.environ.get("SALE_FACTORY_ADDRESS", "0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835")
)
OTC_FACTORY = Web3.to_checksum_address(
    os.environ.get("OTC_FACTORY_ADDRESS", "0x432Ce8ccAa590C895C153121d36cd8992e344022")
)


def load_artifact(rel_path: str) -> dict:
    with open(ARTIFACTS / rel_path) as f:
        return json.load(f)


def deploy_impl(w3: Web3, account, name: str, artifact: dict) -> str:
    """Deploy a new implementation contract (no constructor args, just bytecode)."""
    print(f"\n[deploy] {name}")
    contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    tx = contract.constructor().build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 5_000_000,
        "maxFeePerGas": w3.to_wei(0.5, "gwei"),
        "maxPriorityFeePerGas": w3.to_wei(0.1, "gwei"),
        "chainId": CHAIN_ID,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    hex_h = tx_hash.hex()
    if not hex_h.startswith("0x"):
        hex_h = "0x" + hex_h
    print(f"   tx: {hex_h}")
    rcpt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=240)
    print(f"   block: {rcpt.blockNumber}  status: {rcpt.status}")
    if rcpt.status != 1:
        sys.exit(f"deployment of {name} reverted")
    impl_addr = rcpt.contractAddress
    print(f"   {name} impl: {impl_addr}")
    return impl_addr


def update_factory_impl(
    w3: Web3,
    account,
    factory_addr: str,
    setter_name: str,
    new_impl: str,
    factory_label: str,
):
    print(f"\n[update] {factory_label}.{setter_name}({new_impl})")
    abi = [
        {
            "inputs": [{"name": "impl", "type": "address"}],
            "name": setter_name,
            "outputs": [],
            "type": "function",
            "stateMutability": "nonpayable",
        },
    ]
    factory = w3.eth.contract(address=factory_addr, abi=abi)
    tx = factory.functions[setter_name](new_impl).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 200_000,
        "maxFeePerGas": w3.to_wei(0.5, "gwei"),
        "maxPriorityFeePerGas": w3.to_wei(0.1, "gwei"),
        "chainId": CHAIN_ID,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    hex_h = tx_hash.hex()
    if not hex_h.startswith("0x"):
        hex_h = "0x" + hex_h
    print(f"   tx: {hex_h}")
    rcpt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    print(f"   block: {rcpt.blockNumber}  status: {rcpt.status}")
    if rcpt.status != 1:
        sys.exit(f"setter call reverted")


def main():
    w3 = Web3(Web3.HTTPProvider(RPC))
    admin = Account.from_key(ADMIN_KEY)
    print(f"Admin: {admin.address}")
    print(f"Admin ETH: {Web3.from_wei(w3.eth.get_balance(admin.address), 'ether')}")
    print(f"Chain: {w3.eth.chain_id}")

    # Load artifacts
    sale_artifact = load_artifact("sale/Sale.sol/Sale.json")
    otc_artifact = load_artifact("otc/IssuerOTCToken.sol/IssuerOTCToken.json")
    print(f"\nSale bytecode size:        {len(sale_artifact['bytecode'])//2 - 1} bytes")
    print(f"IssuerOTCToken bytecode:   {len(otc_artifact['bytecode'])//2 - 1} bytes")

    # 1. Deploy Sale impl
    sale_impl = deploy_impl(w3, admin, "Sale", sale_artifact)

    # 2. Update SaleFactory
    update_factory_impl(
        w3, admin, SALE_FACTORY,
        "setSaleImplementation", sale_impl, "CiretaSaleFactory",
    )

    # 3. Deploy IssuerOTCToken impl
    otc_impl = deploy_impl(w3, admin, "IssuerOTCToken", otc_artifact)

    # 4. Update IssuerOTCTokenFactory
    update_factory_impl(
        w3, admin, OTC_FACTORY,
        "setOTCTokenImplementation", otc_impl, "IssuerOTCTokenFactory",
    )

    print("\n✓ Round-4 deployment complete.")
    print(f"\nNew Sale impl:           {sale_impl}")
    print(f"New IssuerOTCToken impl: {otc_impl}")
    print("\nUpdate contracts/deployments/base-sepolia.json with these addresses.")


if __name__ == "__main__":
    main()
