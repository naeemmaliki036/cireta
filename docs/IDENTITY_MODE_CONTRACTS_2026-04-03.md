# Identity Mode — Contract Comparison

**Date:** 2026-04-03

## SimpleIdentityRegistry Mode (Whitelist)

Lightweight KYC verification using a simple `mapping(address => bool)` whitelist.
Backend calls `addToWhitelist(wallet, country)` after Sumsub KYC approval.
Gas per investor: ~50K.

### Contracts Deployed (13)

| Contract | Type | Purpose |
|----------|------|---------|
| IssuerRegistry | Proxy | Approved issuers |
| PlatformFeeManager | Proxy | Fee collection (2% default) |
| CiretaToken | Implementation | ERC-3643 security token |
| SimpleIdentityRegistry | Implementation | Whitelist — `isVerified() = whitelist[addr]` |
| ModularCompliance | Implementation | Pluggable compliance engine |
| Sale | Implementation | Multi-phase token sale |
| CiretaFractionToken | Implementation | Vesting receipt token (6 decimals) |
| CiretaVault | Implementation | Token escrow for vesting |
| CiretaTokenFactory | Proxy | Deploys Token + SimpleIdentityRegistry + Compliance trios |
| CiretaSaleFactory | Proxy | Deploys Sale contracts |
| CiretaFractionFactory | Proxy | Deploys Vault + FractionToken pairs |
| CountryAllowModule | Proxy | Geographic transfer restrictions |
| MaxHolderCountModule | Proxy | Cap total unique holders |

### Contracts NOT Deployed

| Contract | Purpose | Why skipped |
|----------|---------|-------------|
| IdentityRegistry (impl) | Full ERC-3643 claim verification | Replaced by SimpleIdentityRegistry |
| IdentityRegistryStorage (proxy) | Shared wallet → ONCHAINID mapping | Simple mode uses internal mapping |
| ClaimTopicsRegistry (proxy) | Required claim topics [KYC, AML] | No claims in simple mode |
| TrustedIssuersRegistry (proxy) | Trusted claim signers | No claim issuers |
| OnchainID (impl) | Per-investor identity contract | Not needed (~1.9M gas saved per investor) |
| OnchainIDFactory (proxy) | Deploys ONECHAINIDs | Not needed |
| CiretaClaimIssuer (proxy) | Signs/validates KYC claims | No claims |

### Env Vars NOT Needed

```
CLAIM_SIGNER_PRIVATE_KEY
CLAIM_SIGNER_ADDRESS
CLAIM_ISSUER_ADDRESS
IDENTITY_FACTORY_ADDRESS
IDENTITY_REGISTRY_ADDRESS
```

---

## ERC-3643 ONCHAINID Mode (Full Compliance)

Full ERC-3643 identity with per-investor ONCHAINID contracts and cryptographically signed claims.
Backend deploys ONCHAINID per investor, signs KYC/AML claims, registers in shared storage.
Gas per investor: ~1.9M.

### Contracts Deployed (20)

Everything from simple mode PLUS:

| Contract | Type | Purpose |
|----------|------|---------|
| IdentityRegistry | Implementation | Full claim verification |
| IdentityRegistryStorage | Proxy | Shared wallet → ONCHAINID mapping |
| ClaimTopicsRegistry | Proxy | Required claim topics [1=KYC, 2=AML] |
| TrustedIssuersRegistry | Proxy | CiretaClaimIssuer registered as trusted |
| OnchainID | Implementation | Per-investor identity (ERC-734/735) |
| OnchainIDFactory | Proxy | Deploys ONCHAINID per investor |
| CiretaClaimIssuer | Proxy | Signs and validates KYC/AML claims |

### Additional Env Vars Required

```
CLAIM_SIGNER_PRIVATE_KEY=0x...    # Separate from deployer
CLAIM_SIGNER_ADDRESS=0x...        # Public address of claim signer
IDENTITY_FACTORY_ADDRESS=0x...    # Set after deployment
IDENTITY_REGISTRY_ADDRESS=0x...   # Set after deployment
CLAIM_ISSUER_ADDRESS=0x...        # Set after deployment
```

---

## Upgrade Path

You can start with simple mode and upgrade to ERC-3643 later without breaking existing tokens:

1. Deploy the 7 identity contracts
2. Update TokenFactory to use IdentityRegistry implementation
3. Call `setSimpleIdentityMode(false)`
4. New tokens use full ONCHAINID; existing tokens keep SimpleIdentityRegistry
5. Optionally migrate existing investors via `IdentityBridgeService`
