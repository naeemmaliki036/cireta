# Cireta Smart Contract Architecture — Complete Mechanics

**Date:** 2026-04-01

---

## The Admin Wallet (Deployer / Platform Owner)

This is the **single most critical key** in the system. It's the `DEPLOYER_PRIVATE_KEY` in your env.

**What it controls:**
- Deploys all platform-level contracts (factories, registries, fee manager)
- Owns all factory contracts (can upgrade implementations via UUPS proxy)
- Can add/remove trusted claim issuers
- Can add/remove claim topics (KYC=1, AML=2)
- Can set platform fee BPS and receiver address
- Can pause/unpause the entire platform
- Can whitelist issuers in the IssuerRegistry

**There's also a second key — `CLAIM_SIGNER_PRIVATE_KEY`:**
- This is the key that **signs KYC/AML claims** on-chain
- It's the key loaded into `CiretaClaimIssuer` as a trusted signer
- Separate from the deployer for security isolation — if the claim signer is compromised, you rotate it without redeploying the platform

**In production, these MUST be different keys.** The deployer should be a cold wallet / multisig. The claim signer can be a hot wallet (used by the backend to auto-sign claims after Sumsub approval).

---

## Layer 1: Platform Contracts (Deployed ONCE, shared by all tokens)

These are your "infrastructure" — deployed by the admin wallet during initial setup:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM LAYER (deploy once)                 │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ TrustedIssuersRegistry│  │ ClaimTopicsRegistry          │    │
│  │ - who can sign claims │  │ - what claims are required   │    │
│  │ - add/remove issuers  │  │ - topic 1 = KYC              │    │
│  └──────────────────────┘  │ - topic 2 = AML              │    │
│                             └──────────────────────────────┘    │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ IdentityRegistryStore│  │ IssuerRegistry               │    │
│  │ - wallet → identity  │  │ - approved token issuers     │    │
│  │ - shared across all  │  │ - admin adds issuers here    │    │
│  │   tokens             │  └──────────────────────────────┘    │
│  └──────────────────────┘                                       │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ PlatformFeeManager   │  │ OnchainIDFactory             │    │
│  │ - fee BPS (200=2%)   │  │ - deploys per-user identity  │    │
│  │ - fee receiver wallet│  │ - CREATE2 deterministic addr │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│  ┌──────────────────────┐                                       │
│  │ CiretaClaimIssuer    │                                       │
│  │ - signs KYC claims   │                                       │
│  │ - uses claim signer  │                                       │
│  │   private key        │                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 2: Factory Contracts (Deployed ONCE, create tokens/sales)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FACTORY LAYER (deploy once)                  │
│                                                                 │
│  ┌────────────────────┐  ┌────────────────────┐                │
│  │ CiretaTokenFactory │  │ CiretaSaleFactory  │                │
│  │ - deployToken()     │  │ - deploySale()     │                │
│  │ - creates Token +   │  │ - deploySaleVested │                │
│  │   IdentityRegistry  │  │ - creates Sale     │                │
│  │   + Compliance trio │  │   contracts        │                │
│  │ - supports simple   │  └────────────────────┘                │
│  │   & ERC-3643 modes  │  ┌────────────────────┐                │
│  └────────────────────┘  │ CiretaFractionFact. │                │
│                           │ - deploys Vault +   │                │
│                           │   FractionToken for │                │
│                           │   vested sales      │                │
│                           └────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 3: Per-Token Contracts (Created by factories for each asset)

When an issuer creates a new gold/copper token:

```
CiretaTokenFactory.deployToken("Cireta Gold", "CGLD", 18, issuerAddress)
   │
   ├── deploys CiretaToken (UUPS proxy) ← the ERC-3643 security token
   ├── deploys IdentityRegistry (or SimpleIdentityRegistry)
   │     └── points to shared IdentityRegistryStorage
   │     └── points to shared TrustedIssuersRegistry
   │     └── points to shared ClaimTopicsRegistry
   ├── deploys ModularCompliance
   │     └── compliance modules attached later (whitelist, country, max holders...)
   └── links them: Token ↔ IdentityRegistry ↔ Compliance
```

**The trio works together on every transfer:**

```
investor.transfer(to, amount)
   │
   ├── Token checks: am I paused? → revert if yes
   ├── Token calls IdentityRegistry.isVerified(to)
   │     ├── looks up wallet → ONCHAINID in IdentityRegistryStorage
   │     ├── checks claims on ONCHAINID against ClaimTopicsRegistry
   │     ├── verifies claim signatures against TrustedIssuersRegistry
   │     └── returns true/false
   ├── Token calls ModularCompliance.canTransfer(from, to, amount)
   │     ├── iterates all attached compliance modules
   │     ├── WhitelistModule: is `to` whitelisted?
   │     ├── CountryAllowModule: is `to`'s country allowed?
   │     ├── MaxHolderCountModule: would this exceed max holders?
   │     ├── MaxBalanceModule: would `to` exceed max balance?
   │     └── returns true/false
   └── if both pass → transfer executes
       if either fails → revert
```

---

## Layer 4: Sales (Created per token offering)

```
CiretaSaleFactory.deploySale(tokenAddress, usdcAddress, phases[], ...)
   │
   ├── DIRECT mode: investors get tokens immediately after contribution
   │     └── Sale holds USDC → sends tokens from issuer's balance
   │
   └── VESTED mode: investors get fraction tokens, real tokens vest over time
         │
         CiretaFractionFactory.deploy(tokenAddr, vestingSchedule)
           ├── deploys CiretaVault (locks real tokens)
           └── deploys CiretaFractionToken (receipt token)
                └── investor gets fractions → claims real tokens as they vest
```

**Sale Lifecycle:**

```
DRAFT → UPCOMING → LIVE → [phase 1] → [phase 2] → ... → COMPLETED → FINALIZED
                                                              │
                                                     if soft cap not met:
                                                         FAILED → refunds
```

---

## Layer 5: The Buy Flow (investor contribution)

```
1. Investor connects wallet (must be registered + KYC verified)
2. Investor approves USDC spend: usdc.approve(saleContract, amount)
3. Investor calls: sale.contribute(amount)
   │
   ├── Sale checks: is phase active? is investor whitelisted for this phase?
   ├── Sale checks: min/max investment limits
   ├── Sale checks: hard cap not exceeded
   ├── Sale pulls USDC: usdc.transferFrom(investor, sale, amount)
   ├── Platform fee deducted: amount * feeBPS / 10000 → PlatformFeeManager
   │
   ├── DIRECT mode:
   │     └── token.transfer(investor, tokenAmount) — immediate delivery
   │
   └── VESTED mode:
         └── fractionToken.mint(investor, tokenAmount) — receipt token
             └── investor claims real tokens later via vault.release()
```

---

## Deployment Sequence

All contracts are already written. The deployment order is:

| Step | What | Script | Admin Wallet Action |
|------|------|--------|---------------------|
| 1 | Compile all contracts | `npx hardhat compile` | — |
| 2 | Deploy platform contracts | `scripts/deploy.ts` | Deployer signs ~8 txns |
| 3 | Register claim topics (1=KYC, 2=AML) | Part of deploy.ts | Deployer calls `addClaimTopic()` |
| 4 | Deploy CiretaClaimIssuer | Part of deploy.ts | Deployer deploys, sets claim signer |
| 5 | Register claim issuer as trusted | Part of deploy.ts | Deployer calls `addTrustedIssuer()` |
| 6 | Deploy factories (Token, Sale, Fraction) | Part of deploy.ts | Deployer deploys 3 factories |
| 7 | Set identity mode on factory | `scripts/setup-simple-mode.ts` | Deployer calls `setSimpleIdentityMode()` |
| 8 | Fund deployer with ETH (Base) | Manual transfer | Gas for all txns |
| 9 | Update `.env` with all deployed addresses | Manual | — |
| 10 | Verify contracts on BaseScan | `npx hardhat verify` | — |

**After platform is live, per-token flow:**

1. Admin approves issuer in `IssuerRegistry`
2. Issuer requests token creation → backend calls `CiretaTokenFactory.deployToken()`
3. Issuer attaches compliance modules → backend calls `compliance.addModule()`
4. Issuer creates sale → backend calls `CiretaSaleFactory.deploySale()`
5. Investors contribute → frontend calls `sale.contribute()` directly (or via backend relay)

---

## Gas Cost Estimates (Base)

| Operation | Gas Units | ~Cost at 0.01 gwei |
|-----------|-----------|---------------------|
| Full platform deploy | ~15M total | ~$0.50 |
| Deploy token trio | ~3M | ~$0.10 |
| Deploy sale | ~2M | ~$0.07 |
| Deploy ONCHAINID (per user) | ~1.9M | ~$0.06 |
| Simple whitelist (per user) | ~50K | ~$0.002 |
| Contribute to sale | ~150K | ~$0.005 |
| Token transfer | ~100K | ~$0.003 |

Base makes this extremely cheap — the full ERC-3643 mode is viable even at scale.

---

## Identity Modes

| Mode | Contract | Service | Gas Cost | Use Case |
|------|----------|---------|----------|----------|
| **Simple (whitelist)** | `SimpleIdentityRegistry.sol` | `SimpleIdentityBridgeService` | ~50K per investor | Default, low-cost, quick verification |
| **ERC-3643 (full)** | `IdentityRegistry.sol` | `IdentityBridgeService` | ~1.9M per investor | Regulatory compliance, institutional, cross-platform |

**Configuration:**
- Environment variable: `IDENTITY_MODE=simple` or `IDENTITY_MODE=erc3643`
- Factory flag: `CiretaTokenFactory.simpleIdentityMode` boolean
- Backend routing: `kyc_service.py` routes to correct bridge service

---

## Key Environment Variables

```bash
# Admin / Deployer
DEPLOYER_PRIVATE_KEY=0x...              # Platform owner — cold wallet / multisig in prod

# Claim Signer (separate from deployer)
CLAIM_SIGNER_PRIVATE_KEY=0x...          # Signs KYC claims — hot wallet OK
CLAIM_ISSUER_ADDRESS=0x...              # CiretaClaimIssuer contract address

# Identity (ERC-3643 mode)
IDENTITY_MODE=simple                    # or erc3643
IDENTITY_FACTORY_ADDRESS=0x...          # OnchainIDFactory
IDENTITY_REGISTRY_ADDRESS=0x...         # Shared IdentityRegistryStorage
IDENTITY_INIT_CODE_HASH=0x...           # For CREATE2 determinism

# Factories
TOKEN_FACTORY_ADDRESS=0x...
SALE_FACTORY_ADDRESS=0x...
FRACTION_FACTORY_ADDRESS=0x...

# Chain
WEB3_RPC_URL=https://...                # Base RPC
CHAIN_ID=8453                           # Base mainnet (84532 for Sepolia)

# Fees
PLATFORM_FEE_BPS=200                    # 2%
PLATFORM_FEE_RECEIVER=0x...             # Where fees go
```
