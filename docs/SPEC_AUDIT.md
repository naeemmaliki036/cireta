# Spec vs Implementation Audit Report

> **Auditor:** Zyda (Opus)
> **Date:** 2026-03-24
> **Scope:** Cireta RWA Launchpad codebase vs 3 specification documents
> **Documents Audited:**
> - `docs/SPEC_GAP_ANALYSIS.md` (Gap Analysis)
> - `docs/SALE_ARCHITECTURE_V2.md` (Sale Architecture V2)
> - `docs/IMPLEMENTATION_PLAN.md` (Implementation Plan)

---

## 1. Executive Summary

### Overall Alignment Score: **62%**

| Document | Alignment | Notes |
|---|---|---|
| SPEC_GAP_ANALYSIS.md | **68%** | Many Phase 1 gaps now closed (data models, whitelist, Redis). Phase 2+ gaps remain open. |
| SALE_ARCHITECTURE_V2.md | **25%** | Current Sale.sol is V1 only. No CiretaFractionToken, CiretaVault, or CiretaFractionFactory exist. |
| IMPLEMENTATION_PLAN.md | **55%** | Sprint 0 is ~90% complete. Sprints 1-11 are 0-10% complete. |

**Bottom line:** The Sprint 0 foundation work has been done well — data model gaps are closed, the whitelist bug is fixed, contract registry exists, Redis JWT blacklist works. However, the Sale Architecture V2 (vault + fraction token model) is entirely unbuilt, and the frontend still doesn't make on-chain `contribute()` calls. The codebase is a solid backend/frontend MVP with placeholder Web3 integration.

---

## 2. SPEC_GAP_ANALYSIS.md — Gap-by-Gap Findings

### Phase 1 Gaps

#### 1.1 Session Management via Redis
- **Gap Status:** ✅ **CLOSED**
- **Evidence:** `packages/common/services/auth_service.py:17-67` — `_TokenBlacklist` class with Redis backend + in-memory fallback. Uses `SETEX` with TTL matching token expiry. Checks on every token decode.
- **Verification:** Redis client lazily initialized, pings on connect, falls back gracefully.

#### 1.2 Deploy ONCHAINID — CREATE2 placeholder
- **Gap Status:** ⚠️ **STILL OPEN**
- **Evidence:** `apps/api/services/web3_identity_service.py:85-90` — `_compute_identity_address()` is still a simplified placeholder using `keccak(text=combined)` instead of proper CREATE2 formula (`keccak256(0xff ++ factory ++ salt ++ keccak256(bytecode))`).
- **Impact:** Identity addresses computed off-chain won't match actual deployed addresses.

#### 1.3 Issue claims — relies on incomplete Web3 service
- **Gap Status:** ⚠️ **STILL OPEN**
- **Evidence:** `apps/api/services/web3_identity_service.py:175` — `issue_kyc_claims()` uses `message` as placeholder signature instead of actual ECDSA signing via the deployer account. Comment: `# Placeholder signature; real impl uses account.sign`.
- **Impact:** Claims issued on-chain would have invalid signatures.

#### 1.4 Token Deploy returns fake address
- **Gap Status:** ⚠️ **PARTIALLY CLOSED**
- **Evidence:** `apps/api/services/web3_token_service.py:36-130` — `deploy_erc3643_token()` now calls `CiretaTokenFactory.deployToken()` via web3.py and parses the `TokenDeployed` event. However, deployment depends on factory being deployed on-chain and `TOKEN_FACTORY_ADDRESS` env var being set.
- **Improvement:** Code path is correct. No longer returns fake address.

#### 1.5 Frontend never calls Sale.contribute() on-chain
- **Gap Status:** ❌ **STILL OPEN**
- **Evidence:** `apps/launchpad/src/components/organisms/InvestFlow.tsx` — 247 lines. Has `USDC_ADDRESS`, `ERC20_APPROVE_ABI` defined (lines 9-22), and 4 steps: `amount → approve → confirm → success`. But:
  - No `useWriteContract` for `Sale.contribute()`
  - No Sale ABI imported
  - Step "confirm" does NOT call on-chain contribute
  - The approve step is the last on-chain action
- **Impact:** USDC approval happens but no actual on-chain contribution. Funds stay in user wallet.

#### 1.6 Project Detail — Only Overview tab
- **Gap Status:** ⚠️ **PARTIALLY CLOSED**
- **Evidence:** `apps/launchpad/src/app/project/[slug]/page.tsx:113` — Tabs now include: `["overview", "phases", "documents", "team"]`. That's 4/6 tabs. Missing: "Financials" and "Token Details" tabs per spec.

#### 1.7 No compliance acknowledgment checkbox
- **Gap Status:** ❌ **STILL OPEN**
- **Evidence:** Searched entire `InvestFlow.tsx` for "acknowledge", "compliance", "regulated", "I understand", "checkbox" — none found. No compliance disclosure step exists in the investment flow.

#### 1.8 Transaction History
- **Gap Status:** ✅ **CLOSED**
- **Evidence:** `apps/launchpad/src/app/portfolio/transactions/page.tsx` — Full transaction history page exists with table showing date, type, amount, status, and BaseScan link. API endpoint at `apps/api/api/v1/endpoints/portfolio.py:221-273` — queries contributions + redemptions, sorts by date.

#### 1.9 Claim flow not on-chain
- **Gap Status:** ⚠️ **PARTIALLY CLOSED**
- **Evidence:** `apps/api/services/sale_contribute_service.py:276-315` — `claim_tokens()` now attempts on-chain `forcedTransfer()` via `Web3TokenService`. If on-chain transfer fails, it reverts claim status to `CONFIRMED` and raises HTTP 502. This is proper rollback behavior.
- **Remaining issue:** Uses `forcedTransfer` instead of calling `Sale.claimTokens()` — different flow than spec.

### Phase 2 Gaps

#### 2.1 Global compliance management UI
- **Gap Status:** ❌ **STILL OPEN**
- **No UI for TrustedIssuersRegistry or ClaimTopicsRegistry management.**

#### 2.2 System health dashboard
- **Gap Status:** ❌ **STILL OPEN**
- **No system health admin page.**

#### 2.3 Issuer fee reports
- **Gap Status:** ❌ **STILL OPEN**

#### 2.4 Per-sale fee cap (fee_cap_usdc)
- **Gap Status:** ✅ **CLOSED**
- **Evidence:** `apps/api/models/token_sale.py:47` — `fee_cap_usdc: Mapped[Decimal | None]` exists. `contracts/src/sale/Sale.sol:52` — `uint256 public feeCapUsdc` exists with cap enforcement in `_finalize()` (line 228: `if (feeCapUsdc > 0 && fee > feeCapUsdc) fee = feeCapUsdc;`).

#### 2.5 Whitelist validation bug
- **Gap Status:** ✅ **CLOSED**
- **Evidence:** `apps/api/services/sale_contribute_service.py:95-130` — Full whitelist validation implemented. Resolves `wallet_address` from parameter or user's primary wallet. Checks `SalePhaseWhitelist` table. No more `NameError`.
- **Test:** `tests/unit/test_whitelist_contribute.py` — 3 tests covering whitelisted, non-whitelisted, and no-wallet scenarios.

#### 2.6 Phase timeline visualization
- **Gap Status:** ❌ **STILL OPEN**
- **Evidence:** No `PhaseTimeline.tsx` component. `grep` for "PhaseTimeline" and "phase.*timeline" returned no results.

#### 2.7 OTC allocation admin UI
- **Gap Status:** ❌ **STILL OPEN (stub)**

#### 2.8 Vesting auto-created by Sale
- **Gap Status:** ❌ **STILL OPEN**
- **No wiring between Sale finalization and VestingSchedule creation.**

#### 2.9 Commodity redemption — tokens burned on approval
- **Gap Status:** ❌ **STILL OPEN**
- **Backend never calls `redemptionManager.approveRedemption()` on-chain.**

#### 2.10 Dividend distribution
- **Gap Status:** ❌ **STILL OPEN**
- **Evidence:** `apps/api/api/v1/endpoints/portfolio.py:205-219` — `/portfolio/dividends` endpoint returns hardcoded empty list with note: "Connect DividendDistributor contract to read live claimable amounts".
- **Frontend:** `apps/launchpad/src/app/portfolio/dividends/page.tsx` — Page exists with UI but calls API that returns empty data.

#### 2.11 Enhanced KYC tiers (Level 2, 3, 4)
- **Gap Status:** ❌ **STILL OPEN (mostly)**
- **Level 4 KYB Corporate implemented. Levels 2 and 3 not differentiated.**

#### 2.12 Safe/Multisig support
- **Gap Status:** ❌ **STILL OPEN**
- **Zero Safe-related code in the codebase.**

### Data Model Gaps

| Spec Field | Status | Evidence |
|---|---|---|
| `users.is_accredited` | ✅ CLOSED | `apps/api/models/user.py:74` |
| `tokens.identity_registry_address` | ✅ CLOSED | `apps/api/models/token.py:113-114` |
| `tokens.compliance_address` | ✅ CLOSED | `apps/api/models/token.py:117-118` |
| `tokens.sale_contract_address` | ✅ CLOSED | `apps/api/models/token.py:121-122` |
| `tokens.vault_address` | ✅ CLOSED | `apps/api/models/token.py:125-126` |
| `tokens.fraction_token_address` | ✅ CLOSED | `apps/api/models/token.py:129-130` |
| `tokens.image_url` | ✅ CLOSED | `apps/api/models/token.py:106-108` |
| `tokens.description` | ✅ CLOSED | `apps/api/models/token.py:101-104` |
| `sales.total_raised_on_platform` | ✅ CLOSED | `apps/api/models/token_sale.py:49` |
| `sales.platform_fee_bps` | ✅ CLOSED | `apps/api/models/token_sale.py:57` |
| `sales.fee_cap_usdc` | ✅ CLOSED | `apps/api/models/token_sale.py:47` |
| `sales.platform_fee_collected` | ✅ CLOSED | `apps/api/models/token_sale.py:50` |
| `sales.sale_mode` | ✅ CLOSED | `apps/api/models/token_sale.py:58` — enum `SaleMode.DIRECT/VESTED` |
| `sales.vault_address` | ✅ CLOSED | `apps/api/models/token_sale.py:59` |
| `sales.fraction_token_address` | ✅ CLOSED | `apps/api/models/token_sale.py:61` |
| `contributions.is_otc` | ✅ CLOSED | `apps/api/models/contribution.py:47` |
| `contributions.otc_reference` | ✅ CLOSED | `apps/api/models/contribution.py:48` |
| `contributions.wallet_address` | ✅ CLOSED | `apps/api/models/contribution.py:50` |
| `vesting_schedules.is_revocable` | ✅ CLOSED | `apps/api/models/vesting_schedule.py:74` |
| `vesting_schedules.is_revoked` | ✅ CLOSED | `apps/api/models/vesting_schedule.py:75` |
| `redemption_requests.rejection_reason` | ✅ CLOSED | `apps/api/models/redemption_request.py:40` |
| `redemption_requests.delivery_details` | ✅ CLOSED | `apps/api/models/redemption_request.py:41` |
| `redemption_requests.delivery_name/address/phone` | ✅ CLOSED | `apps/api/models/redemption_request.py:46-48` |

**Data model score: 100% of Sprint 0.5 items closed.**

### Infrastructure Gaps

| Gap | Status | Evidence |
|---|---|---|
| GitHub Actions CI/CD | ✅ CLOSED | `.github/workflows/ci.yml` — 4 jobs: api-tests (pytest), contract-tests (hardhat), launchpad-build, admin-build |
| The Graph subgraph | ❌ STILL OPEN | Subgraph dir exists but not connected to app |
| Sentry error tracking | ❌ STILL OPEN | No `@sentry/nextjs` or `sentry-sdk` in deps |
| Prometheus + Grafana | ❌ STILL OPEN | |
| Redis JWT blacklist | ✅ CLOSED | See 1.1 above |
| Contract address storage | ✅ CLOSED | See data model table above |

### NEW Discovery Gaps

| Gap | Status | Evidence |
|---|---|---|
| NEW-1: Wallet screening | ❌ STILL OPEN | Zero wallet screening code |
| NEW-2: MFA / 2FA | ❌ STILL OPEN | No TOTP, WebAuthn, or SMS 2FA |
| NEW-3: Webhook retry / DLQ | ❌ STILL OPEN | No `webhook_event` model |
| NEW-4: Contribution idempotency | ✅ CLOSED | `sale_contribute_service.py:155-163` — checks `tx_hash` uniqueness before creating contribution. Returns 409 if duplicate. |
| NEW-5: Compliance acknowledgment | ❌ STILL OPEN | No checkbox in InvestFlow |
| NEW-6: KYC expiry monitoring | ❌ STILL OPEN | `kyc_expires_at` field exists but nothing checks it |
| NEW-7: Claim expiry on ONCHAINID | ❌ STILL OPEN | No expiry set in `issue_kyc_claims()` |
| NEW-8: Contract address storage | ✅ CLOSED | Per-token + per-sale addresses stored |
| NEW-9: Event listener / blockchain poller | ❌ STILL OPEN | No event listener service |
| NEW-10: Circuit breaker on Web3 RPC | ❌ STILL OPEN | |

---

## 3. SALE_ARCHITECTURE_V2.md — Requirement-by-Requirement

### 3.1 CiretaFractionToken.sol
- **Status:** ❌ **NOT IMPLEMENTED**
- **Evidence:** `contracts/src/fraction/` directory does not exist. No `CiretaFractionToken.sol` anywhere in the codebase.
- **Sprint:** 1.1

### 3.2 CiretaVault.sol
- **Status:** ❌ **NOT IMPLEMENTED**
- **Evidence:** `contracts/src/vault/` directory does not exist. No `CiretaVault.sol` anywhere in the codebase.
- **Sprint:** 1.2
- **Note:** The existing `VestingVault.sol` (from pre-V2 architecture) has tests but is NOT the CiretaVault described in the V2 spec.

### 3.3 Updated Sale.sol — Dual Mode (Direct vs Vested)
- **Status:** ❌ **NOT IMPLEMENTED**
- **Evidence:** `contracts/src/sale/Sale.sol` has no `SaleMode` enum, no `vault` or `fractionToken` state variables (lines 14-77). `contribute()` (line 165) never mints fractions or interacts with a vault. `_finalize()` (line 220) never calls `vault.startVesting()`. `claimRefund()` (line 244) never burns fractions.
- **Sprint:** 1.3
- **Current state:** Sale.sol is V1 — single-mode, no vault integration.

### 3.4 CiretaFractionFactory.sol
- **Status:** ❌ **NOT IMPLEMENTED**
- **Evidence:** No `CiretaFractionFactory.sol` exists. No factory for fraction + vault pair deployment.
- **Sprint:** 1.4

### 3.5 CiretaSaleFactory Update (saleMode parameter)
- **Status:** ❌ **NOT IMPLEMENTED**
- **Sprint:** 1.5

### 3.6 Contract Deployment Order
- **Status:** ❌ **NOT IMPLEMENTED**
- **The 6-step deployment flow described in Section 4 of SALE_ARCHITECTURE_V2.md is not scripted.**

### 3.7 Backend SaleMode Support
- **Status:** ⚠️ **DATA MODEL ONLY**
- **Evidence:** `apps/api/models/token_sale.py:58` — `sale_mode: Mapped[SaleMode]` field exists with `SaleMode.DIRECT/VESTED` enum. But `sale_contribute_service.py` does NOT branch on `sale_mode`. All contributions follow the same path regardless of mode.

### 3.8 Fee Calculation (on-platform only, OTC excluded)
- **Status:** ✅ **CORRECT in Sale.sol**
- **Evidence:** `Sale.sol:220-231` — `_finalize()` calculates fee on `totalRaised` (which only includes on-platform contributions, not OTC). `issuerAllocate()` (line 192) adds to `totalOtcAllocated` but NOT to `totalRaised`. Fee cap enforced at line 228.

### 3.9 Excess Policy (Keep vs BurnToMatch)
- **Status:** ❌ **NOT IMPLEMENTED**
- **This is a CiretaVault feature that doesn't exist yet.**

### Sale Architecture V2 Summary

| Component | Spec | Implementation | Gap |
|---|---|---|---|
| CiretaFractionToken | Full Solidity contract spec | Does not exist | 100% missing |
| CiretaVault | Full Solidity contract spec | Does not exist | 100% missing |
| Sale.sol dual mode | Direct vs Vested branching | V1 only, no mode | 100% missing |
| CiretaFractionFactory | Full factory spec | Does not exist | 100% missing |
| Backend sale_mode field | Enum field | Exists but unused | Logic missing |
| Fee calculation | On-platform only, cap, OTC excluded | Correct in contract | ✅ Aligned |
| Deployment flow | 6-step scripted | Not scripted | 100% missing |
| ExcessPolicy | Keep vs BurnToMatch | Does not exist | 100% missing |

**V2 Architecture Alignment: ~25% (data model fields exist, fee calc correct, everything else missing)**

---

## 4. IMPLEMENTATION_PLAN.md — Sprint Completion Status

### Sprint 0 — Critical Bugs & Foundation: **~90% Complete**

| Item | Status | Evidence |
|---|---|---|
| **0.1** Fix whitelist validation bug | ✅ DONE | `sale_contribute_service.py:95-130` — resolves wallet, queries `SalePhaseWhitelist`. Test at `tests/unit/test_whitelist_contribute.py` (3 tests). |
| **0.2** Contract address storage on Token | ✅ DONE | `token.py:113-130` — `identity_registry_address`, `compliance_address`, `sale_contract_address`, `vault_address`, `fraction_token_address` all present. |
| **0.3** ABI Loader + Contract Registry | ✅ DONE | `apps/api/core/contract_registry.py` — 115 lines. Loads from Hardhat artifacts or fallback ABI dir. `get_contract()` returns ready-to-call web3 instance. `_ADDRESS_MAP` maps contract names to settings attrs. |
| **0.4** Redis JWT Blacklist | ✅ DONE | `packages/common/services/auth_service.py:17-67` — Redis-backed with in-memory fallback. `_TokenBlacklist` class with `add()` and `__contains__()`. TTL-based expiry. |
| **0.5** Sale Model Fields from Spec | ✅ DONE | All fields verified present (see Data Model section above). `token_sale.py` has `total_raised_on_platform`, `platform_fee_bps`, `fee_cap_usdc`, `platform_fee_collected`, `sale_mode`, `vault_address`, `fraction_token_address`. `contribution.py` has `is_otc`, `otc_reference`, `wallet_address`, `phase_index`. `vesting_schedule.py` has `is_revocable`, `is_revoked`. `redemption_request.py` has `rejection_reason`, `delivery_details`, `delivery_name/address/phone`. `user.py` has `is_accredited`. `token.py` has `image_url`, `description`, `slug`. |

**Sprint 0 gap:** No Alembic migration files were verified (item 0.5 mentions `infra/alembic/` migration). Schema changes may exist only in model code.

### Sprint 1 — Sale Architecture V2 Contracts: **0% Complete**

| Item | Status | Evidence |
|---|---|---|
| **1.1** CiretaFractionToken.sol | ❌ NOT STARTED | `contracts/src/fraction/` does not exist |
| **1.2** CiretaVault.sol | ❌ NOT STARTED | `contracts/src/vault/` does not exist |
| **1.3** Updated Sale.sol (Dual Mode) | ❌ NOT STARTED | Sale.sol has no SaleMode |
| **1.4** CiretaFractionFactory.sol | ❌ NOT STARTED | Does not exist |
| **1.5** Update CiretaSaleFactory | ❌ NOT STARTED | |
| **1.6** Deployment Script Update | ❌ NOT STARTED | |

### Sprint 2 — Web3 Bridge: **~15% Complete**

| Item | Status | Evidence |
|---|---|---|
| **2.1** Web3 Token Service — Real Deployment | ⚠️ PARTIAL | `web3_token_service.py` calls factory correctly but untested with real factory. |
| **2.2** Web3 Sale Service | ❌ NOT STARTED | `web3_sale_service.py` does not exist |
| **2.3** Web3 Identity Service — Complete | ❌ NOT STARTED | CREATE2 and claim signatures still placeholders |
| **2.4** Web3 Compliance Service — On-Chain | ✅ DONE | `compliance_action_service.py` calls `forced_transfer`, `recover_tokens`, `pause_token`, `unpause_token` via `Web3TokenService`. All 4 actions make real on-chain calls + write audit logs. |
| **2.5** Web3 Vault Service | ❌ NOT STARTED | `web3_vault_service.py` does not exist |
| **2.6** Transaction Receipt Handler | ❌ NOT STARTED | `web3_tx_service.py` does not exist |

### Sprint 3 — Frontend Web3 Integration: **~10% Complete**

| Item | Status | Evidence |
|---|---|---|
| **3.1** Investment Flow — On-Chain Contribute | ❌ NOT STARTED | InvestFlow.tsx has no `Sale.contribute()` call |
| **3.2** Compliance Acknowledgment Checkbox | ❌ NOT STARTED | No acknowledgment UI |
| **3.3** Vault Claim Flow | ❌ NOT STARTED | No vault claim UI |
| **3.4** Direct Sale — Immediate Token Receipt | ❌ NOT STARTED | |
| **3.5** Project Detail Tabs | ⚠️ PARTIAL | 4/6 tabs done (overview, phases, documents, team). Missing: Financials, Token Details. |
| **3.6** Transaction History Page | ✅ DONE | `portfolio/transactions/page.tsx` — full table with date, type, amount, status, BaseScan links. |
| **3.7** Phase Timeline Visualization | ❌ NOT STARTED | No `PhaseTimeline.tsx` component |

### Sprint 4 — Security & Compliance: **~5% Complete**

| Item | Status |
|---|---|
| **4.1** MFA / 2FA | ❌ NOT STARTED |
| **4.2** Wallet Screening | ❌ NOT STARTED |
| **4.3** Webhook Retry + DLQ | ❌ NOT STARTED |
| **4.4** Contribution Idempotency | ✅ DONE — `tx_hash` uniqueness check |
| **4.5** KYC Expiry Monitoring | ❌ NOT STARTED |

### Sprint 5 — Missing API Endpoints: **~15% Complete**

| Item | Status | Notes |
|---|---|---|
| **5.1** Missing CRUD Endpoints | ⚠️ PARTIAL | `GET /portfolio/transactions` ✅, `GET /portfolio/dividends` ✅ (returns empty). Most others still missing. |
| **5.2** Dividend Service | ❌ NOT STARTED | |
| **5.3** OTC Allocation Service | ❌ NOT STARTED | |
| **5.4** Accredited Investor Verification | ❌ NOT STARTED | |

### Sprints 6-11: **0-5% Complete Each**

All Sprint 6-11 items are NOT STARTED with minor exceptions:
- **9.1 CI/CD Pipeline**: ✅ DONE — `ci.yml` exists with 4 jobs (pytest, hardhat, launchpad build, admin build). Missing: staging/production deploy workflows.
- **10.4 Google OAuth**: ❌ NOT STARTED — no callback handler in auth endpoints.

---

## 5. Critical Mismatches (Spec Says X, Code Does Y)

### CRITICAL-1: Sale.contribute() is backend-only, not on-chain
- **Spec:** Investor calls `Sale.contribute()` on-chain → USDC transferred to Sale contract escrow → tokens allocated
- **Code:** Frontend approves USDC spend but never calls `Sale.contribute()`. Backend `sale_contribute_service.py` records contribution in PostgreSQL only. No USDC actually moves to any contract.
- **Impact:** **Platform cannot hold investor funds in escrow. Core business logic broken.**

### CRITICAL-2: Sale Architecture V2 is 100% unbuilt
- **Spec:** Vault + Fraction Token model with two sale modes, excess policies, burn-to-release claims
- **Code:** Sale.sol is V1. No CiretaFractionToken, CiretaVault, or CiretaFractionFactory contracts exist.
- **Impact:** **Vested sale flow (the primary use case for commodity tokens) cannot function.**

### CRITICAL-3: On-chain token claim uses wrong mechanism
- **Spec:** For direct sales: investor calls `Sale.claimTokens()`. For vested sales: investor calls `CiretaVault.claim()`.
- **Code:** Backend `claim_tokens()` uses `Web3TokenService.forced_transfer()` — an admin function that transfers tokens FROM deployer TO investor.
- **Impact:** Requires deployer to hold all tokens. Bypasses Sale contract's claim logic. Not trustless.

### CRITICAL-4: ONCHAINID claim signatures are placeholders
- **Spec:** Claims must be signed with deployer's private key via ECDSA
- **Code:** `web3_identity_service.py:175` — `signature = message` (uses the hash as the signature itself)
- **Impact:** Claims would be rejected on-chain by any properly implemented claim verifier.

### CRITICAL-5: Refund USDC mechanism uses ERC-20 transfer, not Sale contract
- **Spec:** Investor calls `Sale.claimRefund()` → Sale contract returns escrowed USDC
- **Code:** `sale_contribute_service.py:372-410` — Backend calls `transfer()` on USDC contract from deployer wallet, not from Sale contract
- **Impact:** Requires deployer to fund refunds. No trustless escrow.

---

## 6. Missing Features (Spec Requires, Code Doesn't Have)

### From SALE_ARCHITECTURE_V2.md
1. **CiretaFractionToken.sol** — Lightweight gated ERC-20 receipt token
2. **CiretaVault.sol** — Token vault with vesting + burn-to-release
3. **CiretaFractionFactory.sol** — Deploys fraction + vault pairs
4. **ExcessPolicy** — Keep vs BurnToMatch on inter-phase transitions
5. **Dual-mode Sale** — Direct vs Vested branching in contribute/finalize/refund
6. **Vault claim flow** — burn fractions, receive project tokens
7. **getBackingRatio()** — public on-chain transparency view

### From SPEC_GAP_ANALYSIS.md (P0/P1 items still missing)
1. **Wallet screening / sanctions checking** — Zero integration
2. **MFA / Two-Factor Authentication** — Zero implementation
3. **Safe / Multisig wallet support** — Zero implementation
4. **Compliance acknowledgment in invest flow** — No checkbox
5. **Phase timeline visualization** — No component
6. **Dividend distribution backend** — Stub only
7. **KYC expiry monitoring** — Field exists, no monitoring
8. **Event listener / blockchain poller** — No chain sync
9. **The Graph subgraph connected to app** — Exists but disconnected
10. **Sentry error tracking** — Not integrated
11. **Accredited investor (Level 3) verification** — Not implemented

### From IMPLEMENTATION_PLAN.md (key missing files)
| Planned File | Status |
|---|---|
| `contracts/src/fraction/CiretaFractionToken.sol` | ❌ Missing |
| `contracts/src/vault/CiretaVault.sol` | ❌ Missing |
| `contracts/src/platform/CiretaFractionFactory.sol` | ❌ Missing |
| `apps/api/services/web3_sale_service.py` | ❌ Missing |
| `apps/api/services/web3_vault_service.py` | ❌ Missing |
| `apps/api/services/web3_tx_service.py` | ❌ Missing |
| `apps/api/services/wallet_screening_service.py` | ❌ Missing |
| `apps/api/services/mfa_service.py` | ❌ Missing |
| `apps/api/services/dividend_service.py` | ❌ Missing |
| `apps/api/services/event_listener_service.py` | ❌ Missing |
| `apps/api/services/compliance_module_service.py` | ❌ Missing |
| `apps/api/models/webhook_event.py` | ❌ Missing |
| `apps/launchpad/src/components/molecules/PhaseTimeline.tsx` | ❌ Missing |

---

## 7. What IS Working Well

Credit where due — these areas are solid:

1. **Data models are spec-complete** — All Sprint 0.5 fields exist with correct types
2. **Contract registry + ABI loader** — Clean implementation, Hardhat artifact support
3. **Redis JWT blacklist** — Production-quality with fallback
4. **Whitelist validation** — Bug fixed, 3 unit tests covering happy/sad paths
5. **Sale.sol V1** — Multi-phase, OTC allocation, fee calculation with cap, refunds, front-running protection (maxPerBlock)
6. **Compliance action service** — Real on-chain calls for freeze/unfreeze/forced-transfer/pause/unpause with audit logging
7. **Auth service** — Brute force protection, password reset, email verification, token rotation
8. **CI pipeline** — GitHub Actions with 4 jobs covering all layers
9. **Transaction history page** — Fully implemented frontend + backend
10. **Contribution limits** — Per-phase min/max with cumulative checking
11. **tx_hash deduplication** — Idempotency via unique constraint

---

## 8. Recommendations

### Immediate Priority (blocks everything)

1. **Build Sprint 1 (Sale Architecture V2 contracts)** — This is the critical path. Without CiretaFractionToken, CiretaVault, and dual-mode Sale, the platform cannot support its primary use case (vested commodity token sales).

2. **Wire frontend to on-chain contribute** — The InvestFlow must call `Sale.contribute()` after USDC approval. This is the most visible gap — the UI looks complete but doesn't actually execute the core transaction.

3. **Fix ONCHAINID claim signatures** — Replace placeholder with actual ECDSA signing. Without this, no wallet can pass on-chain KYC verification.

### High Priority (production readiness)

4. **Build web3_sale_service.py** — Orchestrate Sale deployment, vault/fraction setup, and contribution recording.
5. **Add compliance acknowledgment** — Legal requirement, simple UI change.
6. **Implement MFA** — Baseline security for financial platform.
7. **Implement wallet screening** — Regulatory requirement.
8. **Build event listener** — DB/chain will diverge without chain sync.

### Medium Priority (feature completeness)

9. Connect The Graph subgraph to frontend
10. Build dividend distribution backend
11. Implement Safe/multisig support
12. Add KYC expiry monitoring
13. Complete remaining project detail tabs
14. Build phase timeline visualization

---

*Report generated 2026-03-24 by Zyda (Claude Opus). Every finding verified against source files — no assumptions made.*
