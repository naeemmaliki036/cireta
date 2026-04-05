# ERC-3643 & ONCHAINID — Complete Identity Flow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PLATFORM (deploy once)                │
│                                                         │
│  IdentityRegistryStorage  ← shared across ALL tokens    │
│  ClaimTopicsRegistry      ← what claims are required    │
│  TrustedIssuersRegistry   ← who can issue claims        │
│  IssuerRegistry           ← approved token issuers      │
│  PlatformFeeManager       ← fee collection              │
│  CiretaTokenFactory       ← deploys new tokens          │
│  CiretaSaleFactory        ← deploys new sales           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              PER TOKEN (created by factory)              │
│                                                         │
│  CiretaToken           ← the ERC-3643 security token    │
│  IdentityRegistry      ← who can hold THIS token        │
│  ModularCompliance     ← transfer rules for THIS token  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              PER INVESTOR (created once)                 │
│                                                         │
│  ONCHAINID contract    ← investor's on-chain identity   │
│    └── Claims          ← KYC, AML, accreditation proofs │
└─────────────────────────────────────────────────────────┘
```

## Phase 1: Platform Setup (One-Time)

**Who**: Platform admin (Cireta)

1. Deploy platform registries:
   - `IdentityRegistryStorage` → stores investor → ONCHAINID mappings
   - `ClaimTopicsRegistry` → add topic 1 (KYC), topic 2 (AML)
   - `TrustedIssuersRegistry` → add Cireta as trusted claim issuer
   - `IssuerRegistry` → manages approved issuers

2. Deploy implementation contracts (used as templates by factories):
   - CiretaToken, IdentityRegistry, ModularCompliance, Sale

3. Deploy factories:
   - `CiretaTokenFactory` (knows all implementation + registry addresses)
   - `CiretaSaleFactory`

4. Transfer IdentityRegistryStorage ownership to TokenFactory

5. Deploy compliance modules:
   - CountryAllowModule, MaxHolderCountModule

6. Deploy `ClaimIssuer` contract (Cireta's claim signing identity)
   → Add to TrustedIssuersRegistry for topics [1, 2]

## Phase 2: Issuer Onboarding

**Who**: Issuer + Platform admin

1. Issuer registers on admin portal → completes KYC/KYB
2. Admin approves issuer → `IssuerRegistry.activateIssuer(issuerWallet)`
3. Issuer is now authorized to deploy tokens

## Phase 3: Token Deployment

**Who**: Issuer via dApp

```
Issuer calls: CiretaTokenFactory.deployToken("Gold Token", "TGLD", 18, issuerWallet)

Factory deploys:
  1. IdentityRegistry proxy
     - Owner: issuer
     - Links to: ClaimTopicsRegistry, TrustedIssuersRegistry, IdentityRegistryStorage

  2. ModularCompliance proxy
     - Owner: issuer

  3. CiretaToken proxy
     - Links to: IdentityRegistry + ModularCompliance
     - Grants AGENT_ROLE, SUPPLY_ROLE to issuer

  4. Binds token ↔ compliance
  5. Binds identity registry ↔ shared storage

Returns: (tokenAddress, identityRegistryAddress, complianceAddress)
```

Result: Issuer has a fully functional ERC-3643 token. Nobody can hold it yet — investors need identities.

## Phase 4: Investor Identity Setup (ONCHAINID)

**Who**: Investor + Cireta (as claim issuer)

### What is ONCHAINID?

An ONCHAINID is a smart contract deployed per-investor implementing ERC-734 (keys) and ERC-735 (claims). Think of it as a **digital passport on-chain** that holds verified claims (KYC passed, AML clean).

```
ONCHAINID Contract (per investor)
├── Keys (ERC-734)
│   ├── Management key (investor's wallet)
│   └── Claim signer keys (authorized claim issuers)
└── Claims (ERC-735)
    ├── Claim #1: KYC (topic=1, signed by Cireta)
    ├── Claim #2: AML (topic=2, signed by Cireta)
    └── Claim #3: Accredited Investor (topic=3, optional)
```

### The Flow

```
Step A: Investor gets an ONCHAINID
  - Option 1: Cireta deploys ONCHAINID for investor (custodial)
  - Option 2: Investor deploys their own (self-sovereign)
  - Option 3: Use an ONCHAINID provider service

Step B: Cireta verifies investor off-chain
  - Investor completes Sumsub KYC/AML → webhook confirms APPROVED

Step C: Cireta signs a claim and adds it to investor's ONCHAINID
  Claim = {
    topic: 1,              // KYC
    scheme: 1,             // ECDSA
    issuer: ciretaClaimIssuer.address,
    signature: sign(investorIdentity, topic, data),
    data: encodedKYCData,
    uri: "https://cireta.com/kyc/proof"
  }
  ciretaClaimIssuer → investor.onchainID.addClaim(claim)

Step D: Register investor with token's Identity Registry
  identityRegistry.registerIdentity(
    investorWallet,      // investor's address
    onchainIDAddress,    // investor's ONCHAINID contract
    countryCode          // ISO country code
  )
  Stores: investorWallet → ONCHAINID in shared IdentityRegistryStorage
```

## Phase 5: How isVerified() Works

Every time tokens move (mint, transfer, buy), the token calls `identityRegistry.isVerified(wallet)`:

```
isVerified(investorWallet):
  │
  ├── 1. Get investor's ONCHAINID from storage
  │      If no ONCHAINID → return FALSE
  │
  ├── 2. Get required claim topics from ClaimTopicsRegistry
  │      topics = [1, 2]  (KYC + AML)
  │
  ├── 3. For EACH required topic:
  │      ├── Get claims from ONCHAINID for this topic
  │      ├── For each claim:
  │      │   ├── Is issuer trusted? (TrustedIssuersRegistry)
  │      │   ├── Is claim valid? (ClaimIssuer.isClaimValid)
  │      │   └── If both YES → topic satisfied ✓
  │      └── If NO valid trusted claim → return FALSE
  │
  └── 4. ALL topics satisfied → return TRUE
```

## Phase 6: Token Transfer Validation

```
Alice sends 100 TGLD to Bob:

CiretaToken._update(alice, bob, 100):
  ├── alice not frozen?                               ✓
  ├── bob not frozen?                                 ✓
  ├── alice has ≥100 unfrozen tokens?                 ✓
  ├── identityRegistry.isVerified(bob)?               ✓
  ├── compliance.canTransfer(alice, bob, 100)?
  │   ├── CountryAllowModule: bob's country allowed?  ✓
  │   ├── MaxHolderCountModule: within limit?         ✓
  │   └── All modules pass                            ✓
  └── Transfer executes ✓
```

If ANY check fails → transaction reverts.

## The Web2 ↔ Web3 Bridge (Critical Gap)

Currently Sumsub KYC approval and on-chain identity are **disconnected**:

```
Current:  Sumsub approves → DB updated (kyc_status = approved) → DONE
                                                                  ↑
                                                          Nothing on-chain

Needed:   Sumsub approves → DB updated
                          → Deploy ONCHAINID for investor
                          → Sign KYC claim with Cireta's ClaimIssuer
                          → Add claim to investor's ONCHAINID
                          → Register identity in IdentityRegistry
```

### Implementation Plan

**Smart Contracts Needed:**
1. `CiretaClaimIssuer.sol` — Cireta's claim issuer identity (extends IClaimIssuer)
2. `OnchainIDFactory.sol` — deploys ONCHAINID proxies for investors

**Backend Service:**
1. `IdentityBridgeService` — triggered by Sumsub webhook after KYC approval
   - Deploys ONCHAINID for investor (via dApp or backend relayer)
   - Signs KYC claim using Cireta's claim issuer key
   - Adds claim to investor's ONCHAINID
   - Registers identity in shared IdentityRegistryStorage
   - Stores onchain_id address in User model

**Database:**
- User model: add `onchain_id_address` field (already partially exists)

**Flow After Implementation:**
```
Investor registers → completes Sumsub KYC → webhook fires
  → Backend: deploy ONCHAINID (or use existing)
  → Backend: sign KYC claim with ClaimIssuer private key
  → Backend: add claim to ONCHAINID
  → Backend: register identity in IdentityRegistryStorage
  → Investor is now verified on-chain for ALL tokens on the platform
```

**Important Design Decision:**
Since all tokens share the same IdentityRegistryStorage, an investor verified once is verified for ALL tokens on the platform. The claim issuer (Cireta) is trusted across all token identity registries.

### Claim Signing

The claim signing happens with a **dedicated private key** (not the platform deployer key). This key is:
- Stored securely (HSM, KMS, or encrypted env var)
- Associated with the ClaimIssuer contract
- Used ONLY for signing identity claims
- Different from the deployer key

Note: This is the ONE case where a backend private key IS needed — for signing claims. All other on-chain actions are via dApp.

### Claim Revocation

When an investor's KYC expires or is revoked:
1. Backend calls `claimIssuer.revokeClaimBySignature(signature)`
2. Next time `isVerified()` is called, `isClaimValid()` returns false
3. Investor can no longer transfer or receive tokens
4. Existing balance is locked until re-verified

### Country Code Management

When registering identity:
- Country code from Sumsub KYC data
- Stored in IdentityRegistryStorage alongside ONCHAINID address
- Used by CountryAllowModule to restrict transfers by jurisdiction
- Can be updated if investor changes jurisdiction
