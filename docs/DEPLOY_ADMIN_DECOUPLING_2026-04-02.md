# Deploy Script — Admin Decoupling Plan (Option 2: Staged Transfer)

**Date:** 2026-04-02

## Problem

The `deploy.ts` script initializes all platform contracts with `deployer.address` as the owner. After deployment, the deployer wallet retains full admin access. The `ciretaAdmin` role should be decoupled — the deployer is a one-time hot wallet, the admin is a long-lived operational wallet (ideally a multisig).

## Contract Audit Result

All 26+ contracts are properly designed for decoupled admin — every `initialize()` accepts an owner parameter, none default to `msg.sender`. The gap is entirely in the deployment script.

## Solution: Staged Deploy (Option 2)

1. Deploy with `deployer.address` as temporary owner (needed for setup steps like `addClaimTopic`)
2. Do all configuration while deployer has ownership
3. Transfer ALL ownership to `PLATFORM_ADMIN_ADDRESS` at end of script
4. Deployer loses all access permanently

### Why not Option 1 (initialize with admin from start)?

The deploy script does setup work requiring ownership (e.g., `addClaimTopic()`). If we initialize with `platformAdmin` from the start, the deployer can't do setup. If `platformAdmin` is a multisig, every setup step requires multi-sig approval during deployment — impractical.

## Contracts to Transfer

| Contract | Current Owner After Deploy | Transfer To |
|----------|---------------------------|-------------|
| ClaimTopicsRegistry | deployer | PLATFORM_ADMIN_ADDRESS |
| TrustedIssuersRegistry | deployer | PLATFORM_ADMIN_ADDRESS |
| IssuerRegistry | deployer | PLATFORM_ADMIN_ADDRESS |
| PlatformFeeManager | deployer | PLATFORM_ADMIN_ADDRESS |
| CiretaTokenFactory | deployer | PLATFORM_ADMIN_ADDRESS |
| CiretaSaleFactory | deployer | PLATFORM_ADMIN_ADDRESS |
| CountryAllowModule | deployer | PLATFORM_ADMIN_ADDRESS |
| MaxHolderCountModule | deployer | PLATFORM_ADMIN_ADDRESS |
| IdentityRegistryStorage | TokenFactory (already transferred) | No change needed |

Also: `PlatformFeeManager.feeReceiver` currently set to `deployer.address` — must be updated to `PLATFORM_FEE_RECEIVER`.

## Environment Variables

```bash
PLATFORM_ADMIN_ADDRESS=0x...      # CiretaAdmin wallet (can be multisig)
PLATFORM_FEE_RECEIVER=0x...       # Where platform fees go (can be same as admin or separate)
```

## Implementation

Add at end of `deploy.ts`, after all setup is complete:

```typescript
const platformAdmin = process.env.PLATFORM_ADMIN_ADDRESS;
const feeReceiver = process.env.PLATFORM_FEE_RECEIVER || platformAdmin;

if (platformAdmin && platformAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("\n=== Transferring Ownership to Platform Admin ===");
    // Transfer each contract's ownership
    // Update feeReceiver on PlatformFeeManager
    // Deployer retains ZERO access after this block
}
```
