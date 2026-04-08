# Cireta Smart Contract Master Guide — Deployment, Identity & Operations

**Date:** 2026-04-03 01:30 UTC+4  
**Status:** Reference  
**Audience:** Platform operators, developers deploying and managing Cireta contracts

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Inventory](#2-contract-inventory)
3. [Key Management](#3-key-management)
4. [Deployment Architecture (5 Layers)](#4-deployment-architecture)
5. [Section A: SimpleIdentityRegistry Mode (Whitelist)](#5-section-a-simpleidentityregistry-mode)
6. [Section B: ERC-3643 ONCHAINID Mode (Full Compliance)](#6-section-b-erc-3643-onchainid-mode)
7. [Token Lifecycle](#7-token-lifecycle)
8. [Sale Lifecycle](#8-sale-lifecycle)
9. [The Buy Flow](#9-the-buy-flow)
10. [Access Control Model](#10-access-control-model)
11. [Compliance Module System](#11-compliance-module-system)
12. [Vesting & Fraction Tokens](#12-vesting--fraction-tokens)
13. [Post-Sale Features](#13-post-sale-features)
14. [Deployment Sequence](#14-deployment-sequence)
15. [Environment Variables](#15-environment-variables)
16. [Gas Cost Reference](#16-gas-cost-reference)
17. [Upgrade Path: Simple → ERC-3643](#17-upgrade-path)
18. [Current Deployment State](#18-current-deployment-state)

---

## 1. System Overview

Cireta is a regulated RWA tokenization launchpad on Base. The smart contract system implements ERC-3643 security tokens with a multi-issuer model. Every token transfer is gated by two checks:

1. **Identity verification** — is the recipient KYC-approved?
2. **Compliance rules** — does this transfer satisfy all regulatory modules?

The system supports two identity modes:
- **Simple mode** (default): Whitelist-based — `mapping(address => bool)` — cheap, fast
- **ERC-3643 mode** (full): ONCHAINID contracts per investor with cryptographically signed claims — institutional-grade, cross-platform portable

Both modes share the same token contract (`CiretaToken.sol`), sale contract (`Sale.sol`), and compliance engine (`ModularCompliance.sol`). Only the identity registry implementation differs.

```
                        ┌──────────────────────────────────┐
                        │         CiretaToken.sol          │
                        │   (calls isVerified() on every   │
                        │    transfer — same interface)     │
                        └──────────┬───────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
        ┌───────────────────┐         ┌───────────────────────┐
        │ SimpleIdentity    │         │ IdentityRegistry      │
        │ Registry          │         │ (ERC-3643)            │
        │                   │         │                       │
        │ isVerified() =    │         │ isVerified() =        │
        │ whitelist[addr]   │         │ check ONCHAINID       │
        │                   │         │ claims against        │
        │ Gas: ~50K/user    │         │ TrustedIssuersRegistry│
        │                   │         │                       │
        │ Location:         │         │ Gas: ~1.9M/user       │
        │ identity/         │         │                       │
        └───────────────────┘         │ Location: token/      │
                                      └───────────────────────┘
```

---

## 2. Contract Inventory

### File Locations (`contracts/src/`)

```
contracts/src/
├── compliance/                    # Transfer restriction modules (11 contracts)
│   ├── ChainlinkPoRChecker.sol    # Proof of Reserves via Chainlink feed
│   ├── ConditionalTransferModule.sol  # Both-party approval required
│   ├── CountryAllowModule.sol     # Geographic restrictions (ISO 3166-1)
│   ├── LockModule.sol             # Per-address transfer lock
│   ├── MaxBalanceModule.sol       # Cap per-investor holding
│   ├── MaxHolderCountModule.sol   # Cap total unique holders
│   ├── MaxOwnershipModule.sol     # Cap % ownership
│   ├── TimeLockedTransferModule.sol   # Global time lock
│   ├── TimeTransfersLimitModule.sol   # Transfer frequency limit
│   ├── TransferRestrictModule.sol # Two-party transfer whitelist
│   └── WhitelistModule.sol        # Recipient-only whitelist
│
├── fraction/                      # Vesting infrastructure
│   └── CiretaFractionToken.sol    # ERC-20 receipt token for vested sales
│
├── identity/                      # Identity verification contracts
│   ├── CiretaClaimIssuer.sol      # Signs KYC/AML claims (ERC-3643 mode)
│   ├── OnchainID.sol              # Per-investor identity (ERC-734/735)
│   ├── OnchainIDFactory.sol       # Deploys ONCHAINID via CREATE2
│   └── SimpleIdentityRegistry.sol # Whitelist-based identity (simple mode)
│
├── interfaces/                    # Shared interfaces (no deployment)
│   ├── IClaimIssuer.sol
│   ├── IClaimTopicsRegistry.sol
│   ├── ICompliance.sol
│   ├── IComplianceModule.sol
│   ├── IIdentity.sol
│   ├── IIdentityRegistry.sol
│   ├── IIdentityRegistryStorage.sol
│   ├── IToken.sol
│   └── ITrustedIssuersRegistry.sol
│
├── mocks/                         # Test helpers (not deployed to production)
│   ├── MockAggregatorV3.sol
│   ├── MockERC20.sol
│   ├── MockIdentityRegistry.sol
│   └── MockIdentityRegistryConfigurable.sol
│
├── otc/                           # Off-platform OTC token system
│   ├── IssuerOTCToken.sol         # Per-issuer OTC receipt token
│   └── IssuerOTCTokenFactory.sol  # Deploys OTC tokens
│
├── platform/                      # Platform-level infrastructure (deploy once)
│   ├── CiretaFractionFactory.sol  # Deploys Vault + FractionToken pairs
│   ├── CiretaSaleFactory.sol      # Deploys Sale contracts
│   ├── CiretaTokenFactory.sol     # Deploys Token + IdentityRegistry + Compliance trios
│   ├── ClaimTopicsRegistry.sol    # Required claim topics (KYC=1, AML=2)
│   ├── IdentityRegistryStorage.sol # Shared wallet → ONCHAINID mapping
│   ├── IssuerRegistry.sol         # Approved token issuers
│   ├── PlatformFeeManager.sol     # Fee collection (BPS-based, per-issuer overrides)
│   └── TrustedIssuersRegistry.sol # Trusted claim signers
│
├── sale/                          # Token sale / fundraising
│   └── Sale.sol                   # Multi-phase sale with soft/hard cap
│
├── token/                         # Per-token contracts
│   ├── CiretaToken.sol            # ERC-3643 security token
│   ├── DividendDistributor.sol    # USDC dividend payouts
│   ├── IdentityRegistry.sol       # Full ERC-3643 identity (claim-based)
│   ├── ModularCompliance.sol      # Pluggable compliance engine
│   └── RedemptionManager.sol      # Burn-to-redeem mechanism
│
└── vault/                         # Token escrow for vested sales
    └── CiretaVault.sol            # Locks tokens, releases on vesting schedule
```

**Total:** 46 Solidity files (11 compliance modules, 9 interfaces, 4 mocks, 22 production contracts)

---

## 3. Key Management

Two separate private keys control the system. They **MUST** be different keys in production.

### Deployer / Platform Admin (`DEPLOYER_PRIVATE_KEY`)

- Deploys all platform-level contracts
- Owns all factories (can upgrade implementations via UUPS)
- Manages IssuerRegistry (add/remove/suspend issuers)
- Manages PlatformFeeManager (set fee BPS, fee receiver)
- Activates sales (regulatory approval gate)
- Emergency withdrawal (90 days post-finalization)
- **Should be a cold wallet or multisig in production**

### Claim Signer (`CLAIM_SIGNER_PRIVATE_KEY`) — ERC-3643 mode only

- Signs KYC/AML claims that are stored in ONCHAINID contracts
- Loaded into `CiretaClaimIssuer` as the trusted signer
- Backend auto-signs claims after Sumsub KYC approval
- **Can be a hot wallet** — if compromised, rotate without redeploying platform
- **Not needed in simple mode**

### Issuer Wallets

- Each issuer has a wallet registered in `IssuerRegistry`
- Issuer wallet controls their own tokens (mint/burn), sales (phases, whitelist), and fund withdrawal
- Cannot self-activate sales (requires admin approval)
- Can deploy sales via `CiretaSaleFactory.deploySale()` (must be an active issuer)

---

## 4. Deployment Architecture

The system is organized into 5 layers:

### Layer 1: Platform Contracts (deploy ONCE, shared by all tokens)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PLATFORM LAYER (deploy once)                     │
│                                                                     │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐  │
│  │ IssuerRegistry       │  │ PlatformFeeManager                 │  │
│  │ - approved issuers   │  │ - default fee BPS (200 = 2%)       │  │
│  │ - register/activate  │  │ - per-issuer fee overrides         │  │
│  │ - suspend/reactivate │  │ - fee receiver wallet              │  │
│  └──────────────────────┘  └────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐  │
│  │ ClaimTopicsRegistry  │  │ TrustedIssuersRegistry             │  │
│  │ (ERC-3643 only)      │  │ (ERC-3643 only)                   │  │
│  │ - topic 1 = KYC      │  │ - CiretaClaimIssuer registered    │  │
│  │ - topic 2 = AML      │  │ - maps issuers → claim topics     │  │
│  └──────────────────────┘  └────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐  │
│  │ IdentityRegistry     │  │ CiretaClaimIssuer                  │  │
│  │ Storage              │  │ (ERC-3643 only)                   │  │
│  │ (ERC-3643 only)      │  │ - signs KYC claims                │  │
│  │ - wallet → ONCHAINID │  │ - uses CLAIM_SIGNER key           │  │
│  │ - shared across all  │  │ - revocation support              │  │
│  │   tokens             │  └────────────────────────────────────┘  │
│  └──────────────────────┘                                           │
│  ┌──────────────────────┐                                           │
│  │ OnchainIDFactory     │                                           │
│  │ (ERC-3643 only)      │                                           │
│  │ - deploys ONCHAINID  │                                           │
│  │   per investor       │                                           │
│  └──────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer 2: Factory Contracts (deploy ONCE, create instances)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FACTORY LAYER (deploy once)                      │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────┐       │
│  │ CiretaTokenFactory       │  │ CiretaSaleFactory         │       │
│  │ - deployToken()           │  │ - deploySale()            │       │
│  │ - creates Token +         │  │ - deploySaleVested()      │       │
│  │   IdentityRegistry +     │  │ - onlyActiveIssuer        │       │
│  │   Compliance trio         │  │ - verifies fee + issuer   │       │
│  │ - simpleIdentityMode flag │  └──────────────────────────┘       │
│  └──────────────────────────┘  ┌──────────────────────────┐       │
│                                 │ CiretaFractionFactory    │       │
│                                 │ - deployVaultAndFraction()│       │
│                                 │ - for vested sales only   │       │
│                                 └──────────────────────────┘       │
│  ┌──────────────────────────┐                                       │
│  │ IssuerOTCTokenFactory    │                                       │
│  │ - deployOTCToken()        │                                       │
│  │ - one OTC token per       │                                       │
│  │   issuer                  │                                       │
│  └──────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer 3: Per-Token Contracts (created by factories for each asset)

```
CiretaTokenFactory.deployToken("Cireta Gold", "CGLD", 18, issuerAddress)
   │
   ├── deploys CiretaToken (UUPS proxy)
   │     └── ERC-3643 security token with freeze, recovery, forced transfer
   │
   ├── deploys IdentityRegistry (UUPS proxy)
   │     ├── SimpleIdentityRegistry (if simpleIdentityMode == true)
   │     │     └── mapping(address => bool) whitelist
   │     └── IdentityRegistry (if simpleIdentityMode == false)
   │           ├── points to shared IdentityRegistryStorage
   │           ├── points to shared TrustedIssuersRegistry
   │           └── points to shared ClaimTopicsRegistry
   │
   ├── deploys ModularCompliance (UUPS proxy)
   │     └── compliance modules attached later by issuer
   │
   └── links: Token ↔ IdentityRegistry ↔ Compliance
```

### Layer 4: Per-Sale Contracts (created per token offering)

```
CiretaSaleFactory.deploySale(tokenAddress, initData)         — Direct mode
CiretaSaleFactory.deploySaleVested(tokenAddress, initData, ...) — Vested mode
   │
   ├── DIRECT mode:
   │     └── Sale.sol only — investors get tokens immediately
   │
   └── VESTED mode:
         ├── Sale.sol — handles contributions
         ├── CiretaVault.sol — locks project tokens, releases on schedule
         └── CiretaFractionToken.sol — receipt token for investors
```

### Layer 5: Per-User Contracts (ERC-3643 mode only)

```
OnchainIDFactory.deployIdentity(investorWallet)
   │
   └── deploys OnchainID (UUPS proxy)
         ├── owned by investor wallet
         ├── stores KYC claim (topic 1) signed by CiretaClaimIssuer
         ├── stores AML claim (topic 2) signed by CiretaClaimIssuer
         └── portable across platforms (ERC-734/735 standard)
```

---

## 5. Section A: SimpleIdentityRegistry Mode

### Overview

The default mode for Cireta. Uses a simple `mapping(address => bool)` whitelist instead of deploying ONCHAINID contracts per investor. Dramatically cheaper and simpler.

### Contract: `SimpleIdentityRegistry.sol`

**Location:** `contracts/src/identity/SimpleIdentityRegistry.sol`

**Key characteristics:**
- Implements `IIdentityRegistry` interface (same as the full registry)
- `isVerified(address)` = `whitelist[address]` — simple boolean lookup
- No claims, no signatures, no ONCHAINID contracts
- Agent-gated write access (backend deployer wallet is the agent)
- Stub implementations for `identity()`, `identityStorage()`, etc. (return address(0))

**Functions used by backend:**
```solidity
addToWhitelist(address wallet, uint16 country)        // single wallet
batchAddToWhitelist(address[] wallets, uint16[] countries)  // batch
removeFromWhitelist(address wallet)
batchRemoveFromWhitelist(address[] wallets)
isVerified(address wallet) → bool
```

### Backend Service: `SimpleIdentityBridgeService`

**Location:** `apps/api/services/simple_identity_bridge_service.py`

**Flow when investor is KYC-approved:**
```
1. Sumsub webhook → KYCService.handle_webhook()
2. KYCService checks IDENTITY_MODE == "simple"
3. Calls SimpleIdentityBridgeService.register_all_wallets(user_id)
4. For each wallet linked to user:
   → SimpleIdentityRegistry.addToWhitelist(wallet, countryCode)
5. Investor can now receive tokens and participate in sales
```

**Flow when investor links new wallet:**
```
1. WalletService.link_wallet(user_id, wallet)
2. If user is KYC-approved:
   → SimpleIdentityBridgeService.register_wallet(wallet, countryCode)
3. New wallet is immediately whitelisted
```

### Contracts NOT deployed in simple mode

| Contract | Purpose | Why skipped |
|----------|---------|-------------|
| `IdentityRegistry.sol` | Full claim verification | Replaced by SimpleIdentityRegistry |
| `IdentityRegistryStorage.sol` | Shared wallet→ONCHAINID storage | Not needed |
| `ClaimTopicsRegistry.sol` | Required claim topics | No claims |
| `TrustedIssuersRegistry.sol` | Trusted claim issuers | No claim issuers |
| `OnchainID.sol` | Per-user identity contract | Not needed (~1.9M gas saved per investor) |
| `OnchainIDFactory.sol` | Deploys ONECHAINIDs | Not needed |
| `CiretaClaimIssuer.sol` | Signs KYC claims | Not needed |

### Env vars NOT needed in simple mode

```
CLAIM_SIGNER_PRIVATE_KEY    # No claims to sign
CLAIM_ISSUER_ADDRESS         # No claim issuer contract
IDENTITY_FACTORY_ADDRESS     # No ONCHAINID factory
IDENTITY_INIT_CODE_HASH      # No CREATE2 determinism
IDENTITY_REGISTRY_ADDRESS    # No shared storage
```

### Minimum viable deployment (simple mode)

8 implementation contracts + factories create proxies per token/sale:

```
Platform:     CiretaTokenFactory + PlatformFeeManager + IssuerRegistry
Token impl:   CiretaToken + SimpleIdentityRegistry + ModularCompliance
Sale impl:    Sale + CiretaSaleFactory
Compliance:   WhitelistModule (minimum one module)
```

---

## 6. Section B: ERC-3643 ONCHAINID Mode

### Overview

Full ERC-3643 compliance with per-investor ONCHAINID contracts. Each investor gets a dedicated identity contract that stores cryptographically signed KYC/AML claims. These claims are verified on-chain during every token transfer.

### How claim verification works

```
investor.transfer(to, amount)
   │
   ├── CiretaToken calls IdentityRegistry.isVerified(to)
   │     │
   │     ├── IdentityRegistryStorage.storedIdentity(to) → ONCHAINID address
   │     │
   │     ├── ClaimTopicsRegistry.getClaimTopics() → [1, 2] (KYC, AML)
   │     │
   │     ├── For each required topic:
   │     │   ├── ONCHAINID.getClaimIdsByTopic(topic) → claim IDs
   │     │   ├── ONCHAINID.getClaim(claimId) → (topic, scheme, issuer, signature, data)
   │     │   ├── TrustedIssuersRegistry.isTrustedIssuer(issuer) → true?
   │     │   ├── TrustedIssuersRegistry.hasClaimTopic(issuer, topic) → true?
   │     │   └── CiretaClaimIssuer.isClaimValid(identity, topic, sig, data) → true?
   │     │         └── Recovers ECDSA signer from signature
   │     │         └── Checks recovered address == claimSigner
   │     │         └── Checks signature not revoked
   │     │
   │     └── Returns true only if ALL required topics have valid claims
   │
   └── Transfer proceeds or reverts
```

### Contract: `IdentityRegistry.sol`

**Location:** `contracts/src/token/IdentityRegistry.sol`

**Key differences from SimpleIdentityRegistry:**
- `isVerified()` does full claim verification (not just whitelist lookup)
- References shared platform contracts: IdentityRegistryStorage, ClaimTopicsRegistry, TrustedIssuersRegistry
- Agent-managed: backend adds wallets + ONCHAINID references

### Contract: `OnchainID.sol`

**Location:** `contracts/src/identity/OnchainID.sol`

**Per-investor identity contract (ERC-734/735):**
- Owned by the investor's wallet
- Stores claims as `{topic, scheme, issuer, signature, data, uri}`
- Claims are added by CiretaClaimIssuer (via backend after Sumsub approval)
- Claim IDs: `keccak256(abi.encode(issuer, topic))`
- Portable across platforms that recognize ERC-3643

### Contract: `CiretaClaimIssuer.sol`

**Location:** `contracts/src/identity/CiretaClaimIssuer.sol`

**Cireta's claim signing identity:**
- `isClaimValid()` — verifies ECDSA signature against `claimSigner` address
- `revokeClaim()` / `revokeClaimBySignature()` — revocation support
- `setClaimSigner()` — rotate signing key without redeployment
- Registered in `TrustedIssuersRegistry` for topics [1 (KYC), 2 (AML)]

### Backend Service: `IdentityBridgeService`

**Location:** `apps/api/services/identity_bridge_service.py`

**Flow when investor is KYC-approved:**
```
1. Sumsub webhook → KYCService.handle_webhook()
2. KYCService checks IDENTITY_MODE == "erc3643"
3. Calls IdentityBridgeService.provision_identity(user_id)
4. Steps:
   a. OnchainIDFactory.deployIdentity(investorWallet) → ONCHAINID address
   b. Sign KYC claim: ECDSA(keccak256(identity, topic=1, data), CLAIM_SIGNER_KEY)
   c. ONCHAINID.addClaim(topic=1, issuer=ClaimIssuer, signature, data)
   d. Sign AML claim similarly
   e. IdentityRegistryStorage.addIdentityToStorage(wallet, ONCHAINID, country)
5. Repeat step (e) for all linked wallets (same ONCHAINID, multiple wallets)
```

### Additional contracts deployed in ERC-3643 mode

| Contract | Purpose | Gas |
|----------|---------|-----|
| `IdentityRegistryStorage` | Shared wallet → ONCHAINID mapping | ~1.5M |
| `ClaimTopicsRegistry` | Required claim topics [1, 2] | ~800K |
| `TrustedIssuersRegistry` | CiretaClaimIssuer registered as trusted | ~1.2M |
| `OnchainIDFactory` | Deploys per-investor ONCHAINID | ~1M |
| `CiretaClaimIssuer` | Signs and validates claims | ~1.5M |
| `OnchainID` (per investor) | Stores investor's claims | ~1.9M each |

### Additional env vars for ERC-3643 mode

```bash
CLAIM_SIGNER_PRIVATE_KEY=0x...    # ECDSA key for signing claims
CLAIM_ISSUER_ADDRESS=0x...         # CiretaClaimIssuer contract
IDENTITY_FACTORY_ADDRESS=0x...     # OnchainIDFactory contract
IDENTITY_REGISTRY_ADDRESS=0x...    # Shared IdentityRegistryStorage
```

---

## 7. Token Lifecycle

### CiretaToken.sol — ERC-3643 Security Token

Every token deployed by `CiretaTokenFactory` is a UUPS-proxied `CiretaToken` with these features:

**Transfer validation (`_update` override):**
```
1. Skip checks for minting (from == address(0)) and burning (to == address(0))
2. Check: sender not frozen
3. Check: sender has sufficient unfrozen balance
4. Check: recipient not frozen
5. Check: IdentityRegistry.isVerified(recipient) == true
6. Check: ModularCompliance.canTransfer(from, to, amount) == true
7. Notify: ModularCompliance.transferred(from, to, amount) — updates module state
```

**Roles (5 access-control roles):**

| Role | Who gets it | Powers |
|------|------------|--------|
| `DEFAULT_ADMIN_ROLE` | Issuer + Admin | Manage roles, set registries |
| `AGENT_ROLE` | Issuer + Admin | Pause/unpause, forced transfers |
| `SUPPLY_ROLE` | Issuer only | Mint and burn tokens |
| `FREEZE_ROLE` | Issuer + Admin | Freeze/unfreeze addresses |
| `RECOVERY_ROLE` | Issuer + Admin | Wallet recovery (lost keys) |

**Key operations:**
- `mint(to, amount)` — requires `SUPPLY_ROLE` + recipient must be KYC-verified
- `burn(account, amount)` — requires `SUPPLY_ROLE`
- `forcedTransfer(from, to, amount)` — bypasses compliance (regulatory seizure)
- `setAddressFrozen(account, bool)` — freeze/unfreeze
- `recoveryAddress(lostWallet, newWallet, onchainID)` — move tokens to new wallet
- `pause()` / `unpause()` — halt all transfers

---

## 8. Sale Lifecycle

### Sale.sol — Multi-Phase Token Sale

**Status flow:**
```
DRAFT ──[admin activates]──→ ACTIVE ──[issuer/admin pauses]──→ PAUSED
                                │                                  │
                                │ [admin unpause]  ←───────────────┘
                                │
                                ├──[hard cap reached → auto-finalize]
                                └──[issuer/admin calls finalizeSale()]
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
              totalRaised ≥ softCap            totalRaised < softCap
                        │                               │
                  FINALIZED_SUCCESS                FINALIZED_FAILED
                        │                               │
                  ┌─────┴─────┐                    Refunds enabled
                  │           │                    claimRefund()
           withdrawFunds()  Platform fee
           (issuer)         deducted
```

**Modes:**
- **Direct:** Investors receive project tokens immediately on `buy()`
- **Vested:** Investors receive fraction tokens. Project tokens are locked in CiretaVault and vest over time. Investors call `vault.claim()` to get vested tokens.

**Phases:** Each sale has one or more phases with:
- Price per token, allocation cap
- Min/max contribution per investor
- Start/end time, whitelist-only flag
- Phases cannot overlap

### OTC Support

Issuers can allocate tokens to off-platform investors via:
- `issuerAllocate(investor, tokenAmount, paymentReference)` — issuer records OTC allocation
- `buyOTC(phaseId, amount)` — investor uses `IssuerOTCToken` to purchase (burns OTC token as payment)
- OTC purchases count toward phase allocation but NOT toward hard cap or USDC raised

---

## 9. The Buy Flow

```
1. Investor connects wallet (must be whitelisted/KYC-verified on-chain)
2. Investor approves USDC: usdc.approve(saleContract, amount)
3. Investor calls: sale.buy(phaseId, amount)
   │
   ├── Checks:
   │   ├── Sale status == Active
   │   ├── Phase is within time window
   │   ├── Investor is KYC-verified (IdentityRegistry.isVerified())
   │   ├── Min/max contribution per investor
   │   ├── Phase allocation not exceeded
   │   ├── Hard cap not exceeded
   │   ├── Per-block limit not exceeded
   │   └── Whitelist check (if phase is whitelist-only)
   │
   ├── Pulls USDC: usdc.transferFrom(investor, sale, amount)
   │
   ├── Calculates tokens: tokenAmount = amount / pricePerToken
   │
   ├── DIRECT mode:
   │   └── token.transfer(investor, tokenAmount)
   │
   └── VESTED mode:
       ├── fractionToken.mint(investor, tokenAmount)
       └── vault.recordAllocation(investor, tokenAmount)
   
   If hard cap reached → auto-finalize
```

---

## 10. Access Control Model

### Sale.sol — Issuer-Centric Model

Admin is resolved dynamically via `factory.owner()` — changing admin on CiretaSaleFactory propagates to ALL deployed sales.

| Function | Modifier | Who | Rationale |
|----------|----------|-----|-----------|
| `activate()` | `adminOnly` | Admin | Regulatory approval gate |
| `pause()` | `onlyIssuerOrAdmin` | Both | Emergency from either side |
| `unpause()` | `adminOnly` | Admin | Only admin lifts regulatory hold |
| `addPhase()` | `onlyIssuer` | Issuer | Issuer configures their sale |
| `setWhitelist()` | `onlyIssuer` | Issuer | Issuer manages investors |
| `finalizeSale()` | `onlyIssuerOrAdmin` | Both | Normal or override finalization |
| `withdrawFunds()` | `onlyIssuer` | Issuer | Issuer's own proceeds |
| `emergencyWithdraw()` | `adminOnly` | Admin | 90 days post-finalization only |
| `setVestedMode()` | `adminOnly` | Admin/Factory | Called by factory during deploy |

### CiretaSaleFactory.sol — Issuer Deployment

- `deploySale()` / `deploySaleVested()` — `onlyActiveIssuer` modifier
- Verifies caller is registered + active in IssuerRegistry
- Post-deployment verification: fee matches PlatformFeeManager, issuer matches caller

---

## 11. Compliance Module System

`ModularCompliance.sol` is a pluggable compliance engine. The issuer attaches modules to their token's compliance contract. Every transfer is checked against ALL attached modules — if any module rejects, the transfer reverts.

### Available Modules

| Module | Purpose | Check Logic |
|--------|---------|-------------|
| `WhitelistModule` | Recipient whitelist | `isWhitelisted(to)` |
| `CountryAllowModule` | Geographic restriction | Both parties' countries in allowlist |
| `MaxBalanceModule` | Per-investor holding cap | `balanceOf(to) + amount ≤ max` |
| `MaxHolderCountModule` | Total holder cap | New holder? count < max |
| `LockModule` | Address lock | Sender not locked (allows mints) |
| `MaxOwnershipModule` | Ownership % cap | Same as MaxBalance |
| `TimeLockedTransferModule` | Time lock | `block.timestamp ≥ unlockTime` |
| `ConditionalTransferModule` | Two-party approval | Both sender & receiver approved |
| `ChainlinkPoRChecker` | Proof of Reserves | Chainlink feed valid & not stale |

### How modules are attached

```solidity
// Issuer adds module to their token's compliance:
compliance.addModule(whitelistModuleAddress);
compliance.setAllowedSelector(bytes4(keccak256("whitelistAddress(address,address)")), true);

// Then configure:
compliance.callModuleFunction(
    abi.encodeCall(WhitelistModule.whitelistAddress, (compliance, investorAddress)),
    whitelistModuleAddress
);
```

---

## 12. Vesting & Fraction Tokens

For vested sales, the system deploys a Vault + FractionToken pair:

### CiretaVault.sol

- Escrows project tokens deposited by the issuer
- Records per-investor allocations
- Vesting schedule: `cliff` + `vestingDuration` (linear)
- `claim()` — investor burns fraction tokens, receives vested project tokens
- `getClaimable(investor)` — view claimable amount

### CiretaFractionToken.sol

- ERC-20 receipt token (e.g., `cCGLD` for Cireta Gold)
- Minted by Sale contract on `buy()`
- Burned by Vault on `claim()`
- KYC-gated transfers (same identity registry check)
- Roles: Sale gets MINTER_ROLE, Vault + Sale get BURNER_ROLE

### Vesting calculation

```
vestedAmount = totalAllocation * min(elapsed - cliff, vestingDuration) / vestingDuration
claimable = vestedAmount - alreadyClaimed
```

---

## 13. Post-Sale Features

### DividendDistributor.sol

Pull-based USDC dividend distribution:
- Issuer deposits USDC → creates epoch with total supply snapshot
- Holders snapshot their balance, then claim pro-rata share
- Anti-gaming: snapshot at deposit time, not claim time
- Batch claim: MAX_CLAIM_BATCH = 100 epochs per call

### RedemptionManager.sol

Burn-to-redeem mechanism:
- Investor requests redemption (tokens escrowed)
- Issuer fulfills off-chain (cash or physical delivery)
- On fulfillment: tokens burned
- Cancellation returns tokens to investor

---

## 14. Deployment Sequence

### Step-by-step order

| Step | What | Script |
|------|------|--------|
| 1 | Compile contracts | `npx hardhat compile` |
| 2 | Deploy platform registries (IdentityRegistryStorage, ClaimTopicsRegistry, TrustedIssuersRegistry, IssuerRegistry, PlatformFeeManager) | `scripts/deploy.ts` |
| 3 | Deploy implementation contracts (CiretaToken, IdentityRegistry/SimpleIdentityRegistry, ModularCompliance, Sale) | `scripts/deploy.ts` |
| 4 | Deploy factories (CiretaTokenFactory, CiretaSaleFactory, CiretaFractionFactory) | `scripts/deploy.ts` |
| 5 | Deploy compliance modules (CountryAllowModule, MaxHolderCountModule, etc.) | `scripts/deploy.ts` |
| 6 | Register claim topics [1, 2] | `scripts/deploy.ts` |
| 7 | Deploy + register CiretaClaimIssuer (ERC-3643 only) | `scripts/deploy.ts` |
| 8 | Set identity mode on factory | `scripts/setup-simple-mode.ts` |
| 9 | Transfer ownership to PLATFORM_ADMIN_ADDRESS | End of `scripts/deploy.ts` |
| 10 | Update `.env` with all deployed addresses | Manual |
| 11 | Verify contracts on BaseScan | `npx hardhat verify` |

### After platform is live — per-token flow

1. Admin activates issuer in `IssuerRegistry`
2. Backend calls `CiretaTokenFactory.deployToken(name, symbol, decimals, issuer)`
3. Issuer attaches compliance modules via `compliance.addModule()`
4. Issuer creates sale → backend calls `CiretaSaleFactory.deploySale()`
5. Admin activates sale → `sale.activate()`
6. Investors contribute → `sale.buy(phaseId, amount)` from frontend

---

## 15. Environment Variables

### Required (both modes)

```bash
DEPLOYER_PRIVATE_KEY=0x...         # Platform owner
WEB3_RPC_URL=https://...           # Base RPC
CHAIN_ID=8453                      # Base mainnet (84532 for testnet)
IDENTITY_MODE=simple               # "simple" or "erc3643"

TOKEN_FACTORY_ADDRESS=0x...        # Set after deployment
SALE_FACTORY_ADDRESS=0x...
FRACTION_FACTORY_ADDRESS=0x...

PLATFORM_FEE_BPS=200               # 2%
PLATFORM_FEE_RECEIVER=0x...
PLATFORM_ADMIN_ADDRESS=0x...       # Final owner (can be multisig)
```

### Additional for ERC-3643 mode

```bash
CLAIM_SIGNER_PRIVATE_KEY=0x...     # Separate from deployer
CLAIM_ISSUER_ADDRESS=0x...         # CiretaClaimIssuer contract
IDENTITY_FACTORY_ADDRESS=0x...     # OnchainIDFactory
IDENTITY_REGISTRY_ADDRESS=0x...    # IdentityRegistryStorage
```

---

## 16. Gas Cost Reference

| Operation | Gas | ~Cost (Base @ 0.01 gwei) |
|-----------|-----|-----|
| Full platform deploy (simple mode) | ~15M total | ~$0.50 |
| Full platform deploy (ERC-3643) | ~22M total | ~$0.75 |
| Deploy token trio (factory) | ~3M | ~$0.10 |
| Deploy sale | ~2M | ~$0.07 |
| Deploy sale + vault + fraction (vested) | ~5M | ~$0.17 |
| Whitelist investor (simple mode) | ~50K | ~$0.002 |
| Deploy ONCHAINID + sign claims (ERC-3643) | ~1.9M | ~$0.06 |
| Buy contribution | ~150K | ~$0.005 |
| Token transfer | ~100K | ~$0.003 |

---

## 17. Upgrade Path

### Simple → ERC-3643 (non-breaking)

1. Deploy identity contracts: `OnchainIDFactory`, `CiretaClaimIssuer`, `IdentityRegistryStorage`, `ClaimTopicsRegistry`, `TrustedIssuersRegistry`
2. Deploy `IdentityRegistry` implementation
3. Update factory: `CiretaTokenFactory.updateImplementations(0, newIdentityRegistryImpl, 0)`
4. Disable simple mode: `CiretaTokenFactory.setSimpleIdentityMode(false)`
5. Set backend: `IDENTITY_MODE=erc3643` + claim signer keys
6. **New tokens** use full ONCHAINID; **existing tokens** keep SimpleIdentityRegistry (backward compatible)
7. Optional: migrate existing investors via `IdentityBridgeService.provision_identity()`

---

## 18. Current Deployment State

### Base Sepolia (testnet)

```
Platform:
  IdentityRegistryStorage: 0xFEe7c667db9b54767A8772dcBC81a9d177C0954E
  ClaimTopicsRegistry:     0xc2A8F6ef64B375872dBf09BD3Eb650a620687F02
  TrustedIssuersRegistry:  0xA695Dd3a5bc6c34BC914a650fAa46596e2E03319
  IssuerRegistry:          0x3bdE32b8AC48d8015e34E2335B5a640072105225
  PlatformFeeManager:      0x545Ce9dc34E3086B505D9fd8DB443906E2c796f6

Implementations:
  CiretaToken:             0x35e6CD52b56642A7f1f172e29e6fEa3b9d9473Bc
  IdentityRegistry:        0x921905f38a3af1C35638f2fAA97B41EA4d7f300c
  ModularCompliance:       0xcD84cad8615664472cbFCCa3dAFFC3270c423039
  Sale:                    0x33f4CA4E9C18c22A179a258082D03A94f1B7d53a
  FractionToken:           0x94064F9B05f2e2D776c048323236df09989199bc
  Vault:                   0x7b8Cfe19cb6a2F3186e996bF10843e6FbEAd8764

Factories:
  CiretaTokenFactory:      0x6918cE85Da96C07Deaeba796512422ab8AEEB99D
  CiretaSaleFactory:       0xe4a06Eaa949D12B173B0bA5f7CaABe473b4e8b5F
  CiretaFractionFactory:   0x224fa1965b5B8C1428eD5D92E6d04CF5967aE9ac

Compliance Modules:
  CountryAllowModule:      0xce620bd7213ed4b56D5AEFc445C3da95C4C7bd24
  MaxHolderCountModule:    0xC21EA2D0f85b25D29e2f9e971d5F76a54986c585
```

### Base Mainnet

Not yet deployed.
