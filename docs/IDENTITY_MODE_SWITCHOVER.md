# Identity Mode Switchover Guide

Cireta supports two identity verification modes. Both are in the codebase — switching is a config change + contract deployment, no code changes needed.

## Current Mode: Simple Whitelist (`IDENTITY_MODE=simple`)

- `SimpleIdentityRegistry.sol` — `mapping(address => bool)` whitelist
- `SimpleIdentityBridgeService` — calls `addToWhitelist(wallet, country)`
- No ONCHAINID contracts deployed per investor
- No claim signing, no ClaimIssuer, no TrustedIssuersRegistry interactions
- Gas per investor: ~50K (vs ~1.9M for ERC-3643)

## How to Switch to Full ERC-3643

When you need the full ONCHAINID + Claims stack (regulatory requirement, institutional investors, cross-platform identity portability), follow these steps:

### Step 1: Environment Variable

```bash
# Change from:
IDENTITY_MODE=simple

# To:
IDENTITY_MODE=erc3643
```

That single change makes the backend use `IdentityBridgeService` (full ONCHAINID) instead of `SimpleIdentityBridgeService` (whitelist).

### Step 2: Deploy ERC-3643 Identity Contracts (if not already deployed)

These contracts should already be deployed from the initial platform setup. If not:

```bash
# Deploy CiretaClaimIssuer (Cireta's claim signing identity)
# Deploy OnchainIDFactory (deploys ONCHAINID per investor)
# Add CiretaClaimIssuer to TrustedIssuersRegistry for topics [1, 2]
```

Set these env vars:
```bash
CLAIM_SIGNER_PRIVATE_KEY=0x...    # Private key for signing claims (NOT the deployer key)
CLAIM_ISSUER_ADDRESS=0x...         # CiretaClaimIssuer contract address
IDENTITY_FACTORY_ADDRESS=0x...     # OnchainIDFactory contract address
```

### Step 3: Update Token Factory On-Chain

```solidity
// On the CiretaTokenFactory contract:

// 1. Deploy new IdentityRegistry implementation (if not already deployed)
// 2. Update the factory to use it
factory.updateImplementations(address(0), newIdentityRegistryImpl, address(0));

// 3. Turn off simple mode
factory.setSimpleIdentityMode(false);
```

**New tokens** deployed after this will use the full IdentityRegistry with ONCHAINID verification.

### Step 4: Existing Tokens (Important!)

**Existing tokens keep their SimpleIdentityRegistry.** This is by design — each token has its own identity registry proxy. Changing the factory doesn't affect already-deployed tokens.

Options for existing tokens:
- **Option A: Leave them on simple mode.** They work fine. Investors are already whitelisted.
- **Option B: Upgrade the proxy.** Since both registries are UUPS upgradeable, the issuer (proxy owner) can upgrade the identity registry proxy to the full IdentityRegistry implementation. This requires migrating all whitelisted wallets to ONCHAINID-based identities.

### Step 5: Migrate Existing Investors (Only if needed)

If you upgrade existing tokens to full ERC-3643, existing investors need ONECHAINIDs:

1. The backend `IdentityBridgeService.provision_identity()` handles this per-user
2. Run a migration script that calls `provision_identity` for each KYC-approved user
3. This deploys ONECHAINIDs, signs claims, and registers identities

```python
# Migration script (run once):
from apps.api.services.identity_bridge_service import IdentityBridgeService

async def migrate_to_erc3643(db):
    users = await db.execute(
        select(User).where(User.kyc_status == "approved", User.onchain_id.is_(None))
    )
    bridge = IdentityBridgeService(db)
    for user in users.scalars():
        try:
            await bridge.provision_identity(user.id)
        except Exception as e:
            print(f"Failed for user {user.id}: {e}")
```

---

## What Each Mode Uses

| Component | Simple Mode | ERC-3643 Mode |
|---|---|---|
| **Contract** | `SimpleIdentityRegistry.sol` | `IdentityRegistry.sol` |
| **Backend service** | `SimpleIdentityBridgeService` | `IdentityBridgeService` |
| **KYC webhook handler** | `_register_simple_identity()` | `_register_erc3643_identity()` |
| **Wallet auto-register** | `SimpleIdentityBridgeService.register_wallet()` | `IdentityBridgeService.register_wallet()` |
| **Config** | `IDENTITY_MODE=simple` | `IDENTITY_MODE=erc3643` |
| **Extra env vars needed** | None | `CLAIM_SIGNER_PRIVATE_KEY`, `CLAIM_ISSUER_ADDRESS`, `IDENTITY_FACTORY_ADDRESS` |
| **Per-investor contracts** | None | ONCHAINID contract |
| **Claim signing** | None | ECDSA with claim signer key |
| **IdentityRegistryStorage** | Not used | Shared across all tokens |
| **ClaimTopicsRegistry** | Not used | Shared, topics [1, 2] |
| **TrustedIssuersRegistry** | Not used | CiretaClaimIssuer registered |

## What Does NOT Change Between Modes

- `CiretaToken.sol` — unchanged, calls `isVerified()` regardless of mode
- `ModularCompliance.sol` — unchanged, compliance modules work the same
- `CiretaSaleFactory.sol` — unchanged
- User model, Wallet model — same fields used
- KYC flow (Sumsub) — same webhook, just different on-chain action
- Frontend — no changes needed

## Factory Mode Flag

The `CiretaTokenFactory` has a `simpleIdentityMode` boolean:

```solidity
// Enable simple whitelist mode (default for new deployments)
factory.setSimpleIdentityMode(true);

// Switch to full ERC-3643 for NEW tokens
factory.setSimpleIdentityMode(false);
```

This controls:
- Which identity registry implementation is used for new tokens
- Whether `IdentityRegistryStorage.bindIdentityRegistry()` is called

## Files Reference

| File | Purpose |
|---|---|
| `contracts/src/identity/SimpleIdentityRegistry.sol` | Whitelist registry contract |
| `contracts/src/token/IdentityRegistry.sol` | Full ERC-3643 registry (unchanged) |
| `contracts/src/identity/OnchainID.sol` | ONCHAINID contract (unchanged, used in erc3643 mode) |
| `contracts/src/identity/CiretaClaimIssuer.sol` | Claim issuer (unchanged, used in erc3643 mode) |
| `contracts/src/identity/OnchainIDFactory.sol` | ONCHAINID factory (unchanged, used in erc3643 mode) |
| `apps/api/services/simple_identity_bridge_service.py` | Whitelist bridge service |
| `apps/api/services/identity_bridge_service.py` | Full ONCHAINID bridge service (unchanged) |
| `apps/api/services/kyc_service.py` | KYC webhook — routes to correct bridge via `identity_mode` |
| `apps/api/services/wallet_service.py` | Wallet linking — auto-registers via correct bridge |
| `packages/common/core/config.py` | `identity_mode` setting |
