# SimpleIdentityRegistry & IssuerRegistry — Role-Based Access Control Upgrade

## Overview

Both `SimpleIdentityRegistry` and `IssuerRegistry` have been upgraded from single-signer (`onlyOwner` / flat `onlyAgent`) to granular role-based access control using OpenZeppelin `AccessControlUpgradeable`.

The upgrade is **fully backward compatible** — existing agents, function signatures, and storage layout are preserved. The proxy address stays the same (UUPS upgrade).

## SimpleIdentityRegistry Roles

| Role | Constant | Can Do |
|------|----------|--------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Grant/revoke all roles, upgrade contract |
| `REGISTRAR_ROLE` | `keccak256("REGISTRAR_ROLE")` | Add wallets to whitelist, update country |
| `COMPLIANCE_ROLE` | `keccak256("COMPLIANCE_ROLE")` | Remove wallets from whitelist |
| `AGENT_ROLE` | `keccak256("AGENT_ROLE")` | Both add + remove (legacy backward compat) |

### Function → Role Matrix

| Function | REGISTRAR | COMPLIANCE | AGENT | Owner |
|----------|-----------|------------|-------|-------|
| `addToWhitelist` | yes | - | yes | yes |
| `batchAddToWhitelist` | yes | - | yes | yes |
| `registerIdentity` | yes | - | yes | yes |
| `batchRegisterIdentity` | yes | - | yes | yes |
| `updateCountry` | yes | - | yes | yes |
| `removeFromWhitelist` | - | yes | yes | yes |
| `batchRemoveFromWhitelist` | - | yes | yes | yes |
| `deleteIdentity` | - | yes | yes | yes |
| `grantRole` / `revokeRole` | - | - | - | yes (DEFAULT_ADMIN_ROLE) |
| `addAgent` / `removeAgent` | - | - | - | yes (onlyOwner) |

## IssuerRegistry Roles

| Role | Constant | Can Do |
|------|----------|--------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Grant/revoke roles, upgrade |
| `ISSUER_MANAGER_ROLE` | `keccak256("ISSUER_MANAGER_ROLE")` | Register, activate, suspend, update issuers |

## Upgrade Process (Testnet/Mainnet)

```bash
# Set env vars
export IDENTITY_REGISTRY_ADDRESS=0x...
export ISSUER_REGISTRY_ADDRESS=0x...
export IDENTITY_SIGNER_ADDRESS=0x...  # Optional — backend signer gets REGISTRAR_ROLE

# Run upgrade script
cd contracts
pnpm exec hardhat run scripts/upgrade-registry.ts --network baseSepolia
```

The script:
1. Upgrades proxy implementation via `upgrades.upgradeProxy()`
2. Calls `migrateToRoles()` — grants `DEFAULT_ADMIN_ROLE` to owner
3. Grants `REGISTRAR_ROLE` to backend signer (if `IDENTITY_SIGNER_ADDRESS` set)
4. Grants `ISSUER_MANAGER_ROLE` to deployer

## Backward Compatibility

- `addAgent()` / `removeAgent()` — still work, now also grant/revoke `AGENT_ROLE`
- `isAgent()` — returns true if address has `AGENT_ROLE`, `REGISTRAR_ROLE`, `COMPLIANCE_ROLE`, or is in legacy `_agents` mapping
- `onlyAgent` modifier — checks all roles + legacy mapping + owner
- All function signatures unchanged — no ABI break
- Backend signer continues to work (gets `AGENT_ROLE` via legacy `addAgent()` or `REGISTRAR_ROLE` via `grantRole()`)
- Storage layout preserved — new AccessControl storage uses reserved `__gap` slots

## Test Results

**26/26 new tests passing** in `contracts/test/SimpleIdentityRegistry.test.ts`:

- Initialization: owner has DEFAULT_ADMIN_ROLE
- REGISTRAR_ROLE: can add, cannot remove
- COMPLIANCE_ROLE: can remove, cannot add
- AGENT_ROLE: full access (backward compat)
- Legacy addAgent/removeAgent: grants/revokes AGENT_ROLE
- Unauthorized access: properly reverted
- migrateToRoles: idempotent, owner-only
- Whitelist count: correct increment/decrement

## Files Changed

| File | Change |
|------|--------|
| `contracts/src/identity/SimpleIdentityRegistry.sol` | Added AccessControlUpgradeable, 3 roles, granular modifiers |
| `contracts/src/platform/IssuerRegistry.sol` | Added AccessControlUpgradeable, ISSUER_MANAGER_ROLE |
| `contracts/scripts/upgrade-registry.ts` | New — upgrade script for both contracts |
| `contracts/test/SimpleIdentityRegistry.test.ts` | New — 26 role-based access tests |
| `apps/admin/src/lib/contracts/abis/simpleIdentityRegistry.ts` | Added role functions to ABI |
