# Cireta Multisig & Contract Upgrade Guide

**Date:** 2026-04-03 04:30 UTC+4  
**Status:** Reference

---

## 1. Ownership Model

```
TESTNET (current)                    PRODUCTION (target)
─────────────────                    ───────────────────
EOA Deployer                         EOA Deployer
  │                                    │
  ├── deploys all contracts            ├── deploys all contracts
  ├── does initial setup               ├── does initial setup
  └── transfers ownership to ──→       └── transfers ownership to ──→
      EOA Platform Admin                   Gnosis Safe Multisig (2-of-3)
      0x8eE48b43...                        0xSafeAddress...
```

### Testnet Phase (Now)

- **Deployer:** `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` (EOA)
- **Platform Admin:** `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` (EOA)
- Admin connects wallet in admin portal UI to approve sales, manage compliance
- Upgrades done via scripts with private key — fast iteration

### Production Phase (Before Mainnet)

- **Deployer:** Same EOA or new one (disposable — loses all access after deploy)
- **Platform Admin:** Gnosis Safe multisig (e.g. 2-of-3 signers)
- All admin operations require multiple signatures
- No single person can unilaterally upgrade contracts or move funds

---

## 2. Migrating from EOA to Multisig

### Step 1: Create the Safe

1. Go to [app.safe.global](https://app.safe.global)
2. Create new Safe on Base (mainnet or Sepolia for testing)
3. Add 3 signers (e.g. CEO, CTO, Legal)
4. Set threshold to 2-of-3
5. Note the Safe address

### Step 2: Transfer Ownership

Run a single script that transfers all platform contracts:

```typescript
// scripts/transfer-to-multisig.ts
const MULTISIG = "0xYourSafeAddress";

const contracts = [
  "CiretaTokenFactory",
  "CiretaSaleFactory", 
  "CiretaFractionFactory",
  "IssuerRegistry",
  "PlatformFeeManager",
  "ClaimTopicsRegistry",      // if deployed
  "TrustedIssuersRegistry",   // if deployed
  "CountryAllowModule",
  "MaxHolderCountModule",
];

for (const name of contracts) {
  const contract = await ethers.getContractAt("OwnableUpgradeable", addresses[name]);
  await contract.transferOwnership(MULTISIG);
  console.log(`${name} → ${MULTISIG}`);
}

// Also update fee receiver
const feeManager = await ethers.getContractAt("PlatformFeeManager", addresses.platformFeeManager);
await feeManager.setFeeReceiver(MULTISIG); // or a separate treasury address
```

### Step 3: Verify

```typescript
// scripts/verify-ownership.ts
for (const name of contracts) {
  const contract = await ethers.getContractAt("OwnableUpgradeable", addresses[name]);
  const owner = await contract.owner();
  console.log(`${name}: ${owner === MULTISIG ? "OK" : "MISMATCH"}`);
}
```

### Step 4: Update .env

```bash
PLATFORM_ADMIN_ADDRESS=0xYourSafeAddress  # Now points to multisig
```

After this, the deployer EOA has **zero access** to any contract.

---

## 3. Contract Upgrades (UUPS)

### How UUPS Upgrades Work

Every upgradeable contract has two parts:
1. **Proxy** — stores state (balances, mappings), never changes address
2. **Implementation** — contains logic, can be swapped

`upgradeTo(newImplementation)` changes which implementation the proxy delegates to. Only the owner can call this.

### With EOA (Testnet)

```bash
# One command, instant
DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/upgrade-sale.ts --network baseSepolia
```

Script:
```typescript
const SaleV2 = await ethers.getContractFactory("Sale");
const newImpl = await SaleV2.deploy();
await newImpl.waitForDeployment();

const factory = await ethers.getContractAt("CiretaSaleFactory", FACTORY_ADDRESS);
await factory.setSaleImplementation(await newImpl.getAddress());
// Done — all new sales use V2, existing sales unchanged
```

### With Multisig (Production)

**Step 1: Deploy new implementation (any EOA — no ownership needed)**

```bash
# Anyone can deploy bytecode — it's just a standalone contract
npx hardhat run scripts/deploy-new-impl.ts --network base
# Output: New Sale implementation deployed at 0xNewImpl...
```

**Step 2: Propose upgrade via Safe**

Option A — Safe UI:
1. Go to app.safe.global → your Safe
2. New Transaction → Transaction Builder
3. Enter `CiretaSaleFactory` address
4. Select `setSaleImplementation(address)`
5. Paste `0xNewImpl...` address
6. Submit transaction

Option B — Script with Safe SDK:
```typescript
import Safe from "@safe-global/protocol-kit";

const safeSdk = await Safe.create({ ethAdapter, safeAddress: MULTISIG });
const tx = await safeSdk.createTransaction({
  transactions: [{
    to: FACTORY_ADDRESS,
    data: factory.interface.encodeFunctionData("setSaleImplementation", [newImplAddress]),
    value: "0",
  }],
});
const txHash = await safeSdk.getTransactionHash(tx);
await safeSdk.proposeTransaction({ safeTransaction: tx, safeTxHash: txHash });
console.log("Proposed — waiting for co-signers");
```

**Step 3: Co-signers review and approve**

1. Other signers see the pending transaction in Safe UI
2. They verify: "Is `0xNewImpl` the correct contract? Is the source verified on BaseScan?"
3. Each signer clicks "Confirm"
4. Once threshold (2-of-3) met → transaction executes automatically

```
Proposer (Signer 1)              Signer 2                    Signer 3
────────────────────             ─────────                   ─────────
Deploy new impl
Propose tx in Safe ──────────→  Reviews in Safe UI
                                Checks BaseScan source
                                Clicks "Confirm" ────────→  (optional — 2/3 met)
                                                            
                                Transaction executes ✓
```

---

## 4. What Requires Multisig Approval (Production)

### High-Risk Operations (require multisig)

| Operation | Contract | Function |
|-----------|----------|----------|
| Upgrade token implementation | CiretaTokenFactory | `updateImplementations()` |
| Upgrade sale implementation | CiretaSaleFactory | `setSaleImplementation()` |
| Upgrade fraction/vault impl | CiretaFractionFactory | `setFractionTokenImplementation()` / `setVaultImplementation()` |
| Activate a sale | Sale | `activate()` |
| Unpause a sale | Sale | `unpause()` |
| Emergency withdrawal | Sale | `emergencyWithdraw()` |
| Switch identity mode | CiretaTokenFactory | `setSimpleIdentityMode()` |
| Update platform fee | PlatformFeeManager | `setDefaultFee()` / `setFeeReceiver()` |
| Register/suspend issuer | IssuerRegistry | `activateIssuer()` / `suspendIssuer()` |
| Add/remove trusted claim issuer | TrustedIssuersRegistry | `addTrustedIssuer()` / `removeTrustedIssuer()` |

### Operations That DON'T Need Multisig

| Operation | Who | Why |
|-----------|-----|-----|
| Deploy new implementation bytecode | Any EOA | No permissions needed — just deploys code |
| Issuer adds sale phases | Issuer wallet | `onlyIssuer` modifier |
| Issuer manages whitelist | Issuer wallet | `onlyIssuer` modifier |
| Issuer withdraws funds | Issuer wallet | `onlyIssuer` modifier |
| Investor buys tokens | Investor wallet | Public function |
| Investor claims tokens/refund | Investor wallet | Public function |

---

## 5. Anti-Patterns (Never Do This)

### Transfer ownership to EOA for upgrades

```
WRONG:
  multisig.transferOwnership(EOA)  ← single key now controls everything
  EOA.upgradeTo(newImpl)
  EOA.transferOwnership(multisig)  ← "put it back"
```

**Why this is dangerous:**
- During the transfer window, one compromised key can upgrade to a malicious contract and drain all funds
- Creates an audit red flag — regulators and investors will question why ownership was temporarily weakened
- If the EOA is compromised mid-transfer, ownership is permanently lost
- Transaction ordering attacks: attacker front-runs the `transferOwnership` back

**The correct approach is always:** deploy implementation with any EOA, propose `upgradeTo` through multisig.

### Use `--no-verify` or skip timelock

In production, consider adding a **timelock** (e.g. 48-hour delay) between proposal and execution for upgrade operations. This gives the community and security team time to review before the upgrade takes effect.

```
Proposal → 48h Timelock → Execution
              ↓
        Community can review
        Security team audits new impl
        Emergency cancel if malicious
```

---

## 6. Recommended Production Setup

```
┌─────────────────────────────────────────────────────────┐
│                    GOVERNANCE STACK                       │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐ │
│  │ Gnosis Safe  │    │ TimelockCtrl │    │ Contracts  │ │
│  │ 2-of-3       │───→│ 48h delay    │───→│ (all)      │ │
│  │              │    │ (optional)   │    │            │ │
│  │ Signers:     │    └──────────────┘    └────────────┘ │
│  │ - CEO        │                                        │
│  │ - CTO        │    For day-to-day ops (activate sale, │
│  │ - Legal      │    register issuer) the Safe can call  │
│  │              │    contracts directly without timelock. │
│  └─────────────┘                                         │
│                      Timelock only for upgrades and      │
│                      fee changes.                        │
└─────────────────────────────────────────────────────────┘
```

### Phased Rollout

| Phase | Admin Type | When |
|-------|-----------|------|
| **1. Development** | Hardhat local EOA | Now |
| **2. Testnet** | EOA (`0x8eE4...`) | Now → pre-launch |
| **3. Mainnet Launch** | Gnosis Safe 2-of-3 | Launch day |
| **4. Mature** | Safe + Timelock | Post-launch, once stable |

---

## 7. Tooling Reference

| Tool | Purpose | Link |
|------|---------|------|
| Gnosis Safe | Multisig wallet | app.safe.global |
| Safe SDK | Programmatic tx proposals | @safe-global/protocol-kit |
| OpenZeppelin Defender | Upgrade management UI | defender.openzeppelin.com |
| BaseScan | Verify contract source | basescan.org |
| Hardhat UUPS Plugin | Deploy upgradeable contracts | @openzeppelin/hardhat-upgrades |

---

## 8. Emergency Procedures

### If a signer's key is compromised

1. Remaining signers create a new Safe with the compromised signer replaced
2. Transfer ownership of all contracts from old Safe to new Safe
3. Revoke the compromised signer from the old Safe
4. All done via the remaining signers (threshold still met without compromised key)

### If the multisig itself needs replacement

Same process — the current multisig transfers ownership to a new multisig. The contracts don't care about the internal structure of the owner — it's just an address.

### If an upgrade goes wrong

UUPS proxies are upgradeable — deploy a fix and upgrade again through the multisig. The proxy address (and all state/balances) remains unchanged.
