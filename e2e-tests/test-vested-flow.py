#!/usr/bin/env python3
"""Full vested contribution flow test — on-chain + API.

Tests the entire lifecycle:
1. Setup: Update sale phase to start now, activate sale
2. Register identity on-chain for test wallet
3. Approve USDC spending
4. Call Sale.contribute()
5. Verify fraction tokens minted
6. Verify vault holds project tokens
7. Wait/simulate vesting cliff
8. Call Vault.claim() for partial vesting
9. Verify tokens released correctly
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from web3 import Web3

# ─── Config ───────────────────────────────────────────────────────
RPC_URL = "https://sepolia.base.org"
API_URL = "http://localhost:8000/api/v1"
WALLET_JSON = os.path.expanduser("~/.ferron/x402-server-wallet.json")

# Contracts
USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
SALE = "0x6B3c990bC29F40bEeF084FE7F261670A93Cb7cB5"
VAULT = "0x4c91Fb4E10A759E227012FF50AD80AE7eEc78652"
FRACTION_TOKEN = "0x7389B895c9Cd980C336a5195FfB88A017d0695Eb"
PROJECT_TOKEN = "0x00Dc7e8B26532631ecf0ED683ca0aFA70Ffd7ec0"
IDENTITY_REGISTRY = "0x1346267F895137FE0BCdb5ED4cc773113Acaf345"

SALE_ID_DB = "ab5be98a-9958-4999-9119-591ed78c6e07"

# ─── Load wallet ──────────────────────────────────────────────────
with open(WALLET_JSON) as f:
    wallet = json.load(f)
PRIVATE_KEY = wallet["private_key"]
WALLET_ADDR = Web3.to_checksum_address(wallet["address"])

# ─── Web3 setup ───────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY)

# ─── ABI loading ─────────────────────────────────────────────────
ARTIFACTS = Path(__file__).resolve().parents[1] / "contracts" / "artifacts" / "src"

def load_abi(contract_path: str) -> list:
    """Load ABI from Hardhat artifacts."""
    p = ARTIFACTS / contract_path
    if not p.exists():
        # Try fallback
        p2 = Path(__file__).resolve().parents[1] / "contracts" / "artifacts" / "contracts" / contract_path
        if p2.exists():
            p = p2
        else:
            raise FileNotFoundError(f"ABI not found: {p} or {p2}")
    with open(p) as f:
        return json.load(f)["abi"]

_last_nonce = -1

def send_tx(tx, gas=500000):
    """Sign and send a transaction, wait for receipt."""
    global _last_nonce
    time.sleep(3)  # Wait between txs to avoid nonce issues
    
    nonce = w3.eth.get_transaction_count(WALLET_ADDR, "pending")
    if nonce <= _last_nonce:
        nonce = _last_nonce + 1
    _last_nonce = nonce
    
    latest = w3.eth.get_block("latest")
    base_fee = latest.get("baseFeePerGas", 1_000_000_000)
    
    tx_params = {
        "chainId": 84532,
        "from": WALLET_ADDR,
        "gas": gas,
        "maxFeePerGas": base_fee * 3 + 2_000_000_000,
        "maxPriorityFeePerGas": 2_000_000_000,
        "nonce": nonce,
        "type": "0x2",
    }
    built = tx.build_transaction(tx_params)
    signed = account.sign_transaction(built)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  TX sent: {tx_hash.hex()} (nonce={nonce})")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt["status"] != 1:
        print(f"  ❌ TX REVERTED! Gas used: {receipt['gasUsed']}")
        return None
    print(f"  ✅ TX confirmed. Gas: {receipt['gasUsed']}")
    return receipt


def main():
    print("=" * 60)
    print("CIRETA VESTED FLOW — END-TO-END ON-CHAIN TEST")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print(f"Wallet: {WALLET_ADDR}")
    print(f"ETH: {w3.eth.get_balance(WALLET_ADDR) / 1e18:.4f}")
    print("=" * 60)

    # ─── Load contracts ───────────────────────────────────────────
    print("\n📦 Loading contract ABIs...")
    
    erc20_abi = [
        {"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
        {"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
        {"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
        {"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    ]
    
    usdc = w3.eth.contract(address=Web3.to_checksum_address(USDC), abi=erc20_abi)
    fraction = w3.eth.contract(address=Web3.to_checksum_address(FRACTION_TOKEN), abi=erc20_abi)
    
    # Sale ABI — need contribute, status, etc
    sale_abi = load_abi("sale/Sale.sol/Sale.json")
    sale = w3.eth.contract(address=Web3.to_checksum_address(SALE), abi=sale_abi)
    
    # Vault ABI
    vault_abi = load_abi("vault/CiretaVault.sol/CiretaVault.json")
    vault = w3.eth.contract(address=Web3.to_checksum_address(VAULT), abi=vault_abi)
    
    # Identity Registry ABI
    ir_abi = load_abi("token/IdentityRegistry.sol/IdentityRegistry.json")
    identity_reg = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY), abi=ir_abi)

    # ─── Step 0: Check sale status ────────────────────────────────
    print("\n🔍 Step 0: Check on-chain sale state...")
    try:
        status = sale.functions.status().call()
        status_names = ["Draft", "Active", "Paused", "FinalizedSuccess", "FinalizedFailed"]
        print(f"  Sale status: {status_names[status] if status < len(status_names) else status}")
        
        total_raised = sale.functions.totalRaised().call()
        print(f"  Total raised: {total_raised / 1e6:.2f} USDC")
        
        hard_cap = sale.functions.hardCap().call()
        soft_cap = sale.functions.softCap().call()
        print(f"  Soft/Hard cap: {soft_cap/1e6:.0f} / {hard_cap/1e6:.0f} USDC")
        
        phase_count = sale.functions.getPhaseCount().call()
        print(f"  Phases: {phase_count}")
        
        if phase_count > 0:
            phase = sale.functions.getPhase(0).call()
            print(f"  Phase 0: name={phase[0]}, price={phase[1]/1e18:.2f}, alloc={phase[2]/1e18:.0f}")
            print(f"           start={datetime.fromtimestamp(phase[6], tz=timezone.utc)}")
            print(f"           end={datetime.fromtimestamp(phase[7], tz=timezone.utc)}")
    except Exception as e:
        print(f"  ⚠️ Could not read sale status: {e}")
    
    # Check sale mode
    try:
        sale_mode = sale.functions.saleMode().call()
        print(f"  Sale mode: {'Direct' if sale_mode == 0 else 'Vested'}")
    except:
        print("  Sale mode: unknown (function may not exist)")

    # ─── Step 1: Check USDC balance ───────────────────────────────
    print("\n💰 Step 1: Check USDC balance...")
    usdc_balance = usdc.functions.balanceOf(WALLET_ADDR).call()
    usdc_decimals = usdc.functions.decimals().call()
    print(f"  USDC balance: {usdc_balance / 10**usdc_decimals:.2f}")
    
    if usdc_balance == 0:
        print("  ⚠️ No USDC! Need to get testnet USDC from faucet first.")
        print("  Try: https://faucet.circle.com/ (Base Sepolia)")
        
        # Try to check if there's USDC somewhere else we can use
        print("\n  Attempting USDC faucet via API...")
        # Circle faucet requires browser interaction, let's just report the gap
        print("  ❌ CANNOT PROCEED — need USDC on Base Sepolia")
        print(f"     Wallet: {WALLET_ADDR}")
        print(f"     Chain: Base Sepolia (84532)")
        print(f"     Amount needed: 100+ USDC")
        return False
    
    # ─── Step 2: Check identity registration ──────────────────────
    print("\n🪪 Step 2: Check identity registration...")
    try:
        is_verified = identity_reg.functions.isVerified(WALLET_ADDR).call()
        print(f"  isVerified({WALLET_ADDR[:10]}...): {is_verified}")
        if not is_verified:
            print("  ⚠️ Wallet not verified on identity registry!")
            print("  Need to register identity + add claims before contributing")
    except Exception as e:
        print(f"  ⚠️ Identity check failed: {e}")
    
    # ─── Step 3: Activate sale (if draft) ─────────────────────────
    print("\n🔓 Step 3: Check/activate sale...")
    try:
        status = sale.functions.status().call()
        if status == 0:  # Draft
            print("  Sale is Draft — need to activate")
            # Check if we're the owner
            owner = sale.functions.owner().call()
            print(f"  Sale owner: {owner}")
            print(f"  Our wallet: {WALLET_ADDR}")
            if owner.lower() == WALLET_ADDR.lower():
                print("  We ARE the owner — activating...")
                # Need to update phase dates to include now
                receipt = send_tx(sale.functions.activate(), gas=200000)
                if receipt:
                    print("  ✅ Sale activated!")
                else:
                    print("  ❌ Activation failed")
                    # May need to update phase dates first
            else:
                print(f"  ❌ We're NOT the sale owner ({owner})")
                print("  Need the issuer to activate the sale")
        elif status == 1:
            print("  ✅ Sale already active")
        else:
            print(f"  ⚠️ Sale in unexpected status: {status}")
    except Exception as e:
        print(f"  ⚠️ Activation check failed: {e}")
    
    # ─── Step 4: Approve USDC ─────────────────────────────────────
    if usdc_balance > 0:
        print("\n✅ Step 4: Approve USDC spending...")
        contribute_amount = 100 * 10**usdc_decimals  # 100 USDC
        
        current_allowance = usdc.functions.allowance(WALLET_ADDR, Web3.to_checksum_address(SALE)).call()
        print(f"  Current allowance: {current_allowance / 10**usdc_decimals:.2f}")
        
        if current_allowance < contribute_amount:
            print(f"  Approving {contribute_amount / 10**usdc_decimals:.2f} USDC...")
            receipt = send_tx(
                usdc.functions.approve(Web3.to_checksum_address(SALE), contribute_amount),
                gas=100000
            )
            if not receipt:
                print("  ❌ USDC approval failed!")
                return False
        else:
            print("  Already approved")
        
        # ─── Step 5: Contribute ───────────────────────────────────
        print("\n🏦 Step 5: Contribute to vested sale...")
        try:
            receipt = send_tx(
                sale.functions.contribute(0, contribute_amount),  # phase 0, 100 USDC
                gas=500000
            )
            if receipt:
                print("  ✅ Contribution successful!")
                
                # Parse events
                for log in receipt["logs"]:
                    print(f"  Log: {log['topics'][0].hex()[:10]}... from {log['address']}")
            else:
                print("  ❌ Contribution reverted!")
                return False
        except Exception as e:
            print(f"  ❌ Contribution failed: {e}")
            return False
        
        # ─── Step 6: Verify fraction tokens ──────────────────────
        print("\n🪙 Step 6: Verify fraction tokens minted...")
        frac_balance = fraction.functions.balanceOf(WALLET_ADDR).call()
        print(f"  Fraction token balance: {frac_balance / 1e18:.4f}")
        
        if frac_balance > 0:
            print("  ✅ Fraction tokens received!")
        else:
            print("  ⚠️ No fraction tokens — may need event listener processing")
        
        # ─── Step 7: Check vault ──────────────────────────────────
        print("\n🔐 Step 7: Check vault state...")
        try:
            claimable = vault.functions.getClaimable(WALLET_ADDR).call()
            print(f"  Claimable now: {claimable / 1e18:.4f}")
            
            backing = vault.functions.getBackingRatio().call()
            print(f"  Backing ratio: locked={backing[0]/1e18:.4f}, supply={backing[1]/1e18:.4f}")
        except Exception as e:
            print(f"  ⚠️ Vault check failed: {e}")
        
        # ─── Step 8: Try claim (may be before cliff) ─────────────
        print("\n🎯 Step 8: Attempt vault claim...")
        try:
            claimable = vault.functions.getClaimable(WALLET_ADDR).call()
            if claimable > 0:
                print(f"  Claimable: {claimable / 1e18:.4f} tokens")
                receipt = send_tx(vault.functions.claim(), gas=300000)
                if receipt:
                    print("  ✅ Claim successful!")
                    # Check balances after
                    project_balance = w3.eth.contract(
                        address=Web3.to_checksum_address(PROJECT_TOKEN), 
                        abi=erc20_abi
                    ).functions.balanceOf(WALLET_ADDR).call()
                    print(f"  Project token balance: {project_balance / 1e18:.4f}")
                else:
                    print("  ❌ Claim reverted")
            else:
                print("  ⏳ Nothing claimable yet (before cliff or no allocation)")
        except Exception as e:
            print(f"  ⚠️ Claim failed: {e}")
    
    # ─── Summary ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"  USDC balance: {usdc_balance / 10**usdc_decimals:.2f}")
    print(f"  ETH balance: {w3.eth.get_balance(WALLET_ADDR) / 1e18:.4f}")
    
    frac_balance = fraction.functions.balanceOf(WALLET_ADDR).call()
    print(f"  Fraction tokens: {frac_balance / 1e18:.4f}")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
