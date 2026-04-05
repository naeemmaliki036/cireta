# Simple Identity Mode — Contract Inventory

**Date:** 2026-04-01

This document details which contracts are needed vs skipped when using `SimpleIdentityRegistry` (whitelist mode) instead of full ERC-3643 ONCHAINID, and the gas savings involved.

---

## NEEDED (deploy these)

| # | Contract | Purpose | Deploy Gas |
|---|----------|---------|------------|
| **Platform Layer** | | | |
| 1 | `CiretaTokenFactory.sol` | Deploys token trios | ~2.5M |
| 2 | `CiretaSaleFactory.sol` | Deploys sale contracts | ~1.5M |
| 3 | `CiretaFractionFactory.sol` | Deploys vault + fraction (vested sales only) | ~1.5M |
| 4 | `PlatformFeeManager.sol` | Collects platform fees from sales | ~800K |
| 5 | `IssuerRegistry.sol` | Whitelist of approved issuers | ~900K |
| **Token Layer (implementations — deployed once, proxied per token)** | | | |
| 6 | `CiretaToken.sol` | ERC-3643 security token (the actual token) | ~3M |
| 7 | `SimpleIdentityRegistry.sol` | Whitelist — `mapping(address => bool)` | ~1.2M |
| 8 | `ModularCompliance.sol` | Pluggable compliance engine | ~1.5M |
| **Sale Layer (implementation — deployed once)** | | | |
| 9 | `Sale.sol` | USDC escrow, phases, contributions | ~3M |
| **Vault Layer (only if you use vested sales)** | | | |
| 10 | `CiretaVault.sol` | Locks tokens, releases on vesting schedule | ~2M |
| 11 | `CiretaFractionToken.sol` | Receipt token for vested investors | ~1.5M |
| **Compliance Modules (pick what you need)** | | | |
| 12 | `WhitelistModule.sol` | Per-token investor whitelist | ~500K |
| 13 | `CountryAllowModule.sol` | Block/allow countries | ~500K |
| 14 | `MaxBalanceModule.sol` | Cap per-investor holding | ~400K |
| 15 | `MaxHolderCountModule.sol` | Cap total holders | ~500K |
| 16 | `MaxOwnershipModule.sol` | Cap % ownership | ~400K |
| 17 | `LockModule.sol` | Freeze/unfreeze wallets | ~400K |
| **OTC (if needed)** | | | |
| 18 | `IssuerOTCToken.sol` | OTC token implementation | ~1M |
| 19 | `IssuerOTCTokenFactory.sol` | Deploys OTC tokens | ~1M |
| **Post-sale features** | | | |
| 20 | `DividendDistributor.sol` | USDC dividend payouts | ~1.5M |
| 21 | `RedemptionManager.sol` | Burn-to-redeem | ~1M |
| **Interfaces (no deployment — compile only)** | | | |
| — | `IIdentityRegistry.sol` | Interface that SimpleIdentityRegistry implements | — |
| — | `IToken.sol`, `ICompliance.sol`, etc. | Shared interfaces | — |
| **Mocks (testnet only)** | | | |
| — | `MockERC20.sol` | Fake USDC for testing | — |
| — | `MockAggregatorV3.sol` | Fake Chainlink feed | — |

---

## NOT NEEDED (skip entirely in simple mode)

| Contract | Why you skip it | Gas saved |
|----------|----------------|-----------|
| `IdentityRegistry.sol` | Replaced by `SimpleIdentityRegistry` — no claim verification | ~2M impl |
| `IdentityRegistryStorage.sol` | Shared wallet→ONCHAINID storage — not needed when whitelist is per-registry | ~1.5M |
| `ClaimTopicsRegistry.sol` | Defines KYC/AML claim topics — no claims in simple mode | ~800K |
| `TrustedIssuersRegistry.sol` | Whitelists claim issuers — no claim issuers needed | ~1.2M |
| `OnchainID.sol` | Per-user identity contract — ~1.9M **per investor** saved | ~1.9M × N |
| `OnchainIDFactory.sol` | Deploys ONCHAINID via CREATE2 — not needed | ~1M |
| `CiretaClaimIssuer.sol` | Signs KYC claims on-chain — not needed | ~1.5M |
| `ChainlinkPoRChecker.sol` | Optional — skip if not using Proof of Reserve | ~800K |
| `ConditionalTransferModule.sol` | Optional compliance module | ~400K |
| `TimeLockedTransferModule.sol` | Optional compliance module | ~400K |
| `TimeTransfersLimitModule.sol` | Optional compliance module | ~400K |
| `TransferRestrictModule.sol` | Optional compliance module | ~400K |

---

## Gas Savings Summary

| | Full ERC-3643 | Simple Mode | Savings |
|---|---|---|---|
| **Platform deploy (one-time)** | ~22M gas | ~15M gas | **~7M gas** |
| **Per-investor registration** | ~1.9M gas (deploy ONCHAINID + sign claims) | ~50K gas (one `addToWhitelist` call) | **~38x cheaper** |
| **100 investors** | ~190M gas | ~5M gas | **~185M gas saved** |
| **1,000 investors** | ~1.9B gas | ~50M gas | **~1.85B gas saved** |

On Ethereum mainnet at 30 gwei, 1.9M gas per investor = ~$5-8 per investor. Simple mode = ~$0.10 per investor.

---

## What Changes in the Backend

| Config | Full ERC-3643 | Simple Mode |
|--------|---------------|-------------|
| `IDENTITY_MODE` | `erc3643` | `simple` |
| `CLAIM_SIGNER_PRIVATE_KEY` | Required | **Not needed** |
| `CLAIM_ISSUER_ADDRESS` | Required | **Not needed** |
| `IDENTITY_FACTORY_ADDRESS` | Required | **Not needed** |
| `IDENTITY_INIT_CODE_HASH` | Required | **Not needed** |
| `IDENTITY_REGISTRY_ADDRESS` | Required | **Not needed** |
| KYC bridge service | `IdentityBridgeService` (deploys ONCHAINID) | `SimpleIdentityBridgeService` (calls `addToWhitelist`) |

---

## Minimum Viable Deploy (simplest possible)

If you want the absolute minimum to get a token sale live:

```
Platform:     CiretaTokenFactory + PlatformFeeManager + IssuerRegistry
Token impl:   CiretaToken + SimpleIdentityRegistry + ModularCompliance
Sale impl:    Sale + CiretaSaleFactory
Compliance:   WhitelistModule (just one module)
Env vars:     DEPLOYER_PRIVATE_KEY, WEB3_RPC_URL, CHAIN_ID
```

That's **8 contracts** to deploy (implementations) + factories create proxies per token/sale.

---

## Upgrade Path to Full ERC-3643

You can upgrade at any time without breaking existing tokens:

1. Deploy identity contracts: `OnchainIDFactory`, `CiretaClaimIssuer`, `IdentityRegistryStorage`, `ClaimTopicsRegistry`, `TrustedIssuersRegistry`
2. Deploy `IdentityRegistry` implementation
3. Update `CiretaTokenFactory.identityRegistryImplementation` to point to the full `IdentityRegistry`
4. Call `CiretaTokenFactory.setSimpleIdentityMode(false)`
5. Set backend env: `IDENTITY_MODE=erc3643` + claim signer keys
6. New tokens will use full ONCHAINID flow; existing tokens keep their `SimpleIdentityRegistry` unchanged (backward compatible)
7. Optionally migrate existing investors via `identity_bridge_service.provision_identity()`

---

## Environment Variables (Simple Mode)

```bash
# Admin / Deployer
DEPLOYER_PRIVATE_KEY=0x...              # Platform owner — cold wallet / multisig in prod

# Chain
WEB3_RPC_URL=https://...                # RPC endpoint
CHAIN_ID=8453                           # Base mainnet (84532 for Sepolia)

# Identity
IDENTITY_MODE=simple                    # Whitelist mode

# Factories (set after deployment)
TOKEN_FACTORY_ADDRESS=0x...
SALE_FACTORY_ADDRESS=0x...
FRACTION_FACTORY_ADDRESS=0x...

# Fees
PLATFORM_FEE_BPS=200                    # 2%
PLATFORM_FEE_RECEIVER=0x...             # Where fees go

# NOT needed in simple mode:
# CLAIM_SIGNER_PRIVATE_KEY
# CLAIM_ISSUER_ADDRESS
# IDENTITY_FACTORY_ADDRESS
# IDENTITY_INIT_CODE_HASH
# IDENTITY_REGISTRY_ADDRESS
```
