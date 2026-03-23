# Cireta Implementation Plan

> **Created:** 2026-03-24 | **Author:** Zyda (Opus)
> **Baseline:** 62% spec alignment (Sprint 0 complete, Sprints 1-11 at 0-15%)
> **Goal:** Production-ready Phase 1 + Phase 2 on Base mainnet

---

## Sprint Status Overview

| Sprint | Description | Status | Est. Duration |
|--------|-------------|--------|---------------|
| 1 | On-Chain Sale Integration (Core Flow) | 🔴 NOT STARTED | 1 week |
| 2 | CiretaFractionToken + CiretaVault + CiretaFractionFactory | 🔴 NOT STARTED | 1.5 weeks |
| 3 | Real ONCHAINID Claim Signing + Trustless Token Claims | 🔴 NOT STARTED | 1 week |
| 4 | Refunds via Sale Contract, Dividend Backend, Event Listeners | 🔴 NOT STARTED | 1.5 weeks |
| 5 | Wallet Screening, MFA, Safe/Multisig, KYC Expiry | 🔴 NOT STARTED | 1.5 weeks |
| 6 | Frontend Completion — Phase Timeline, Compliance, Full Data Flow | 🔴 NOT STARTED | 1 week |
| 7 | Seed Data + E2E Testing + Production Hardening | 🔴 NOT STARTED | 1.5 weeks |

**Critical Path:** Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4
**Parallelizable:** Sprint 5 can start alongside Sprint 2. Sprint 6 can start after Sprint 3.

---

## Sprint 1: On-Chain Sale Integration (Core Flow)

> **The single most important sprint.** Without this, the platform is a UI mockup — no USDC moves, no tokens transfer, nothing is on-chain.

### Entry Criteria
- Sprint 0 complete (verified ✅ — whitelist fix, contract registry, Redis blacklist, data models)
- Sale.sol V1 deployed on Base Sepolia testnet
- USDC test token available on Base Sepolia
- At least one ERC-3643 token deployed via CiretaTokenFactory

### Sprint Definition of Done
- Investor can: connect wallet → approve USDC → call Sale.contribute() on-chain → see contribution confirmed in both DB and on BaseScan
- Full round-trip: frontend → on-chain tx → backend records contribution from chain event/receipt
- Works on Base Sepolia testnet with real wallet interactions

### Test Plan
1. **Unit tests:** Sale.contribute() with various amounts, phase limits, whitelist checks (Hardhat)
2. **Integration test:** Deploy Sale on Hardhat fork, contribute USDC, verify state changes
3. **Browser test:** Connect MetaMask → approve → contribute → verify tx on BaseScan
4. **Edge cases:** Contribute at exactly min/max, contribute when phase is full, contribute from non-KYC'd wallet (should revert)

### Seed Data Requirements
- Deploy USDC mock on Base Sepolia (or use existing testnet USDC)
- Deploy one CiretaToken ("Wassa Gold" / WMAU) via factory
- Deploy one Sale contract with 2 phases (Seed @ $85K, Private @ $115K)
- Whitelist 2-3 test wallets for Phase 1
- Fund test wallets with testnet USDC

---

#### Task 1.1: Web3 Sale Service — Backend Orchestration
**Priority:** CRITICAL
**Definition of Done:**
- New file `apps/api/services/web3_sale_service.py` exists
- `deploy_sale()` method calls `CiretaSaleFactory.deploySale()` via web3.py, returns deployed Sale address
- `record_on_chain_contribution(tx_hash)` method reads `ContributionMade` event from receipt, creates/updates Contribution row in DB
- `get_sale_status(sale_address)` reads on-chain `status`, `totalRaised`, `phases` and returns structured data
- Unit test: mock web3 calls, verify DB writes match event data
- Integration test: on Hardhat fork, deploy sale + contribute + verify DB state matches chain

**Files to create:**
- `apps/api/services/web3_sale_service.py` (new — ~200 lines)

**Files to modify:**
- `apps/api/core/contract_registry.py` — add Sale ABI loading (currently has CiretaToken + factory, needs Sale)
- `apps/api/api/v1/endpoints/sales.py` — add `POST /sales/{id}/deploy` endpoint
- `apps/api/schemas/sale.py` — add `SaleDeployRequest`, `SaleDeployResponse` schemas

**Dependencies:** Sprint 0 (contract registry, ABI loader) — ✅ complete

---

#### Task 1.2: Transaction Receipt Handler
**Priority:** CRITICAL
**Definition of Done:**
- New file `apps/api/services/web3_tx_service.py` exists
- `submit_transaction(tx_data)` builds, signs with deployer key, submits, returns tx_hash
- `wait_for_receipt(tx_hash, timeout=120)` polls for receipt, returns structured receipt or raises TimeoutError
- `parse_events(receipt, contract, event_name)` extracts typed event data from receipt logs
- Handles nonce conflicts (auto-retry with incremented nonce, max 3 retries)
- All web3 services use this instead of raw web3 calls
- Logs every tx_hash + status to `audit_logs` table
- Test: submit tx, verify receipt parsing, verify audit log entry

**Files to create:**
- `apps/api/services/web3_tx_service.py` (new — ~150 lines)

**Files to modify:**
- `apps/api/services/web3_token_service.py` — refactor to use tx service (lines 36-130)
- `apps/api/services/web3_identity_service.py` — refactor to use tx service
- `apps/api/services/compliance_action_service.py` — refactor to use tx service

**Dependencies:** None

---

#### Task 1.3: Frontend InvestFlow — On-Chain contribute() Call
**Priority:** CRITICAL
**Definition of Done:**
- `InvestFlow.tsx` (247 lines) modified: after USDC `approve` step, calls `Sale.contribute(phaseId, amount)` via wagmi `useWriteContract`
- Sale ABI imported from `contracts/artifacts/` or embedded in frontend
- Contribution step shows: "Confirming on-chain…" with tx hash link to BaseScan
- On success: calls backend `POST /contributions` with `tx_hash` to record in DB
- On revert: shows user-friendly error (e.g., "KYC not verified", "Phase not active", "Exceeds max contribution")
- Error mapping: contract revert reasons → human-readable messages
- Test: Vitest mock of wagmi hooks, verify step transitions and error handling

**Files to modify:**
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` (lines 9-247 — major rewrite of steps 3-4)

**Files to create:**
- `apps/launchpad/src/lib/contracts/saleAbi.ts` (new — Sale ABI export)
- `apps/launchpad/src/lib/contracts/addresses.ts` (new — contract address constants per chain)

**Dependencies:** Task 1.1 (backend must accept tx_hash-based contribution recording)

---

#### Task 1.4: Backend Contribution Recording from On-Chain Event
**Priority:** CRITICAL
**Definition of Done:**
- `sale_contribute_service.py` modified: `create_contribution()` accepts `tx_hash` parameter
- Before creating contribution, verifies tx_hash on-chain: reads receipt, parses `ContributionMade` event, confirms `contributor == user.wallet_address` and `amount` matches
- If tx_hash already exists in DB (dedup), returns existing contribution with 200 (not 409 error for UX)
- Contribution row stores: `tx_hash`, `wallet_address`, `phase_index`, `amount`, `tokens_allocated` — all sourced from on-chain event, not user input
- Test: submit known tx_hash, verify contribution data matches chain event; submit duplicate, verify dedup

**Files to modify:**
- `apps/api/services/sale_contribute_service.py` (lines 140-200 — `create_contribution()` method)
- `apps/api/api/v1/endpoints/sales.py` — update contribute endpoint to accept `tx_hash`
- `apps/api/schemas/sale.py` — add `tx_hash` to `ContributionCreate` schema

**Dependencies:** Task 1.2 (tx receipt handler for parsing events)

---

#### Task 1.5: Sale Deployment Script for Testnet
**Priority:** HIGH
**Definition of Done:**
- `contracts/scripts/deploy.ts` updated to deploy Sale contract linked to a specific CiretaToken
- Script deploys: Sale with 2 phases (Seed + Private), sets issuer, sets feeManager
- Outputs all addresses to console + writes to `contracts/deployments/base-sepolia.json`
- Can be re-run idempotently (checks if already deployed)
- Hardhat test verifies full deployment flow

**Files to modify:**
- `contracts/scripts/deploy.ts` (add Sale deployment after token deployment)

**Files to create:**
- `contracts/deployments/base-sepolia.json` (new — deployed addresses registry)

**Dependencies:** None

---

#### Task 1.6: Contribution Limits Enforcement (Frontend + Backend)
**Priority:** HIGH
**Definition of Done:**
- Frontend: before sending contribute tx, checks `minContribution` and `maxContribution` from sale phase data, shows inline validation error
- Frontend: checks user's cumulative contributions against `maxContribution` per phase
- Backend: `create_contribution()` validates amount against phase limits BEFORE accepting (even though contract also checks — defense in depth)
- Backend: reads on-chain `contributions[user].amount` to get authoritative cumulative total
- Test: contribute below min (rejected), contribute above max (rejected), contribute exactly at limit (accepted)

**Files to modify:**
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` — add validation in amount step
- `apps/api/services/sale_contribute_service.py` — add pre-flight limit checks

**Dependencies:** Task 1.3 (frontend contribute flow exists)

---

## Sprint 2: CiretaFractionToken + CiretaVault + CiretaFractionFactory

> **Enables vested sales** — the primary use case for commodity-backed tokens (gold, copper). Without this, only direct (immediate transfer) sales work.

### Entry Criteria
- Sprint 1 complete: on-chain contribute() working end-to-end for Direct mode
- Sale.sol V1 tests passing
- Contract registry can load new ABIs

### Sprint Definition of Done
- CiretaFractionToken deploys, mints to KYC'd wallets, blocks non-KYC'd transfers
- CiretaVault locks project tokens, tracks per-investor allocations, releases on burn-to-claim
- Sale.sol updated: `SaleMode.Direct` works exactly as before; `SaleMode.Vested` mints fractions + records in vault
- CiretaFractionFactory deploys fraction+vault pairs in single tx, grants correct roles
- Full Hardhat test suite for all new contracts + updated Sale

### Test Plan
1. **CiretaFractionToken:** mint, burn, transfer (KYC'd → KYC'd ✅, KYC'd → non-KYC'd ❌), role checks
2. **CiretaVault:** deposit, record allocation, start vesting, claim (before cliff ❌, after cliff partial ✅, after full vesting 100% ✅), excess handling (BurnToMatch + Keep), withdrawExcess
3. **Sale Vested Mode:** contribute → fraction minted + vault allocated → finalize → vault.startVesting() → claim via vault
4. **Sale Direct Mode:** contribute → token transferred immediately (regression — must still work)
5. **CiretaFractionFactory:** deploy pair, verify roles, verify addresses stored
6. **Browser test:** Invest in vested sale → see fraction token in wallet → wait for cliff → claim → see project token

### Seed Data Requirements
- Deploy CiretaFractionToken implementation
- Deploy CiretaVault implementation
- Deploy CiretaFractionFactory
- Create one vested sale (Wassa Gold Seed, cliff=90d, vest=180d)
- Create one direct sale (for regression)

---

#### Task 2.1: CiretaFractionToken Contract
**Priority:** CRITICAL
**Definition of Done:**
- `contracts/src/fraction/CiretaFractionToken.sol` exists per SALE_ARCHITECTURE_V2.md §2.1
- UUPS upgradeable, ERC20Burnable, AccessControl
- `MINTER_ROLE` for Sale (mint on contribute), `BURNER_ROLE` for Vault (burn on claim)
- `_update()` override: checks `identityRegistry.isVerified()` on both sender and receiver for non-mint/burn transfers
- `initialize()` sets name, symbol, decimals, identityRegistry, projectToken, vault, admin
- Custom errors: `RecipientNotVerified`, `SenderNotVerified`, `ZeroAddress`
- Hardhat tests: mint ✅, burn ✅, transfer KYC→KYC ✅, transfer KYC→nonKYC ❌, unauthorized mint ❌, unauthorized burn ❌

**Files to create:**
- `contracts/src/fraction/CiretaFractionToken.sol` (~120 lines)
- `contracts/test/CiretaFractionToken.test.ts` (~200 lines)

**Dependencies:** None (uses existing `IIdentityRegistry` interface at `contracts/src/interfaces/IIdentityRegistry.sol`)

---

#### Task 2.2: CiretaVault Contract
**Priority:** CRITICAL
**Definition of Done:**
- `contracts/src/vault/CiretaVault.sol` exists per SALE_ARCHITECTURE_V2.md §2.2
- UUPS upgradeable, Ownable, ReentrancyGuard
- `depositTokens()` — onlySale, locks project tokens via safeTransferFrom
- `recordAllocation()` — onlySale, tracks per-investor totalFractions
- `startVesting()` — onlySale, sets finalized=true, records vesting start per investor
- `claim()` — investor calls, calculates vested amount, burns fractions, releases project tokens (CEI pattern)
- `handlePhaseExcess()` — onlySale, BurnToMatch returns to issuer, Keep does nothing
- `withdrawExcess()` — onlyIssuer, only post-finalization, only excess above outstanding fractions
- `getClaimable(address)` — public view, returns claimable amount based on vesting schedule
- `getBackingRatio()` — public view, returns (locked, fractionSupply)
- ExcessPolicy enum: Keep, BurnToMatch
- Hardhat tests: deposit ✅, allocate ✅, claim before cliff ❌, claim after cliff ✅, claim after full vest ✅, excess BurnToMatch ✅, excess Keep ✅, withdrawExcess ✅, reentrancy ❌, unauthorized calls ❌

**Files to create:**
- `contracts/src/vault/CiretaVault.sol` (~250 lines)
- `contracts/test/CiretaVault.test.ts` (~350 lines)

**Dependencies:** Task 2.1 (CiretaFractionToken must exist for burn integration)

---

#### Task 2.3: Update Sale.sol — Dual Mode (Direct vs Vested)
**Priority:** CRITICAL
**Definition of Done:**
- `contracts/src/sale/Sale.sol` (currently 331 lines) updated with:
  - New state: `SaleMode saleMode`, `CiretaVault vault`, `CiretaFractionToken fractionToken`
  - `initialize()` accepts saleMode, vault address, fractionToken address
  - `contribute()`: if Direct → `token.safeTransfer(investor, amount)` + `claimed=true`; if Vested → `fractionToken.mint(investor, amount)` + `vault.recordAllocation(investor, amount)`
  - `_finalize()`: if Vested → `vault.startVesting()`
  - `claimTokens()`: require Direct mode, revert with "Use vault.claim() for vested sales" otherwise
  - `claimRefund()`: if Vested → burn investor's fraction balance before refunding USDC
- ALL existing Sale.test.ts tests still pass (Direct mode = backward compatible)
- New tests for Vested mode: contribute mints fractions, finalize starts vesting, refund burns fractions

**Files to modify:**
- `contracts/src/sale/Sale.sol` (lines 1-331 — add ~80 lines of new state + logic)

**Files to create/modify:**
- `contracts/test/Sale.test.ts` — add Vested mode test suite (~200 additional lines)

**Dependencies:** Tasks 2.1, 2.2 (fraction token + vault must exist)

---

#### Task 2.4: CiretaFractionFactory Contract
**Priority:** HIGH
**Definition of Done:**
- `contracts/src/platform/CiretaFractionFactory.sol` exists per SALE_ARCHITECTURE_V2.md §2.4
- UUPS upgradeable, Ownable
- `deployVaultAndFraction()`: deploys both via ERC1967Proxy, grants MINTER_ROLE to Sale, BURNER_ROLE to Vault, tracks in `saleToVault` and `saleToFraction` mappings
- Stores implementation addresses, allows upgrade via owner
- Event: `VaultDeployed(sale, vault, fractionToken, projectToken)`
- Hardhat test: deploy pair, verify roles, verify mappings, verify event emission

**Files to create:**
- `contracts/src/platform/CiretaFractionFactory.sol` (~100 lines)
- `contracts/test/CiretaFractionFactory.test.ts` (~150 lines)

**Dependencies:** Tasks 2.1, 2.2

---

#### Task 2.5: Update CiretaSaleFactory — SaleMode Parameter
**Priority:** HIGH
**Definition of Done:**
- `contracts/src/platform/CiretaSaleFactory.sol` updated: `deploySale()` accepts `SaleMode` parameter
- For Vested mode: coordinates with CiretaFractionFactory to deploy vault+fraction pair
- Updated initialization data passed to Sale proxy includes saleMode, vault, fractionToken addresses
- Existing direct-mode deployment still works (regression test)
- Test: deploy Direct sale (no vault), deploy Vested sale (vault+fraction created)

**Files to modify:**
- `contracts/src/platform/CiretaSaleFactory.sol`

**Dependencies:** Task 2.3 (updated Sale.sol), Task 2.4 (CiretaFractionFactory)

---

#### Task 2.6: Backend Vault Service
**Priority:** HIGH
**Definition of Done:**
- New file `apps/api/services/web3_vault_service.py` exists
- `get_claimable(vault_address, investor_address)` — calls vault.getClaimable() on-chain, returns uint256
- `get_vesting_info(vault_address, investor_address)` — calls vault.investorVesting() + vestingConfig(), returns structured vesting data
- `get_backing_ratio(vault_address)` — calls vault.getBackingRatio(), returns (locked, fractionSupply)
- API endpoint: `GET /portfolio/vesting/{sale_id}/claimable` — returns claimable amount for authenticated user
- Test: mock web3 calls, verify data transformation

**Files to create:**
- `apps/api/services/web3_vault_service.py` (~120 lines)

**Files to modify:**
- `apps/api/api/v1/endpoints/portfolio.py` — add vesting claimable endpoint
- `apps/api/schemas/portfolio.py` — add VestingClaimableResponse schema

**Dependencies:** Task 2.2 (vault contract deployed)

---

#### Task 2.7: Deployment Script Update — V2 Contracts
**Priority:** MEDIUM
**Definition of Done:**
- `contracts/scripts/deploy.ts` updated with full V2 deployment:
  1. Deploy CiretaFractionToken implementation
  2. Deploy CiretaVault implementation
  3. Deploy updated Sale implementation
  4. Deploy CiretaFractionFactory (with impl addresses)
  5. Update CiretaSaleFactory with new Sale implementation
- All addresses written to `contracts/deployments/base-sepolia.json`
- Script is idempotent — can be re-run without duplicating deployments

**Files to modify:**
- `contracts/scripts/deploy.ts`
- `contracts/deployments/base-sepolia.json`

**Dependencies:** Tasks 2.1-2.5 (all contracts must compile)

---

## Sprint 3: Real ONCHAINID Claim Signing + Trustless Token Claims

> **Fixes CRITICAL-3 and CRITICAL-4** from the audit. Without real claim signatures, no wallet passes on-chain KYC verification. Without trustless claims, the platform requires deployer to hold all tokens.

### Entry Criteria
- Sprint 1 complete (on-chain contribute works)
- ONCHAINID contracts deployed on Base Sepolia
- ClaimTopicsRegistry configured with required topics (KYC=1, COUNTRY=2, ACCREDITED=3)
- TrustedIssuersRegistry has platform deployer as trusted issuer

### Sprint Definition of Done
- ONCHAINID deployed per-user via CREATE2 (deterministic address)
- KYC claims signed with deployer private key (real ECDSA), issued on-chain with expiry
- Country claims issued alongside KYC claims
- Wallet registered in IdentityRegistry after ONCHAINID + claims
- Sale.claimTokens() works for Direct mode (trustless — tokens held by Sale contract, not deployer)
- CiretaVault.claim() works for Vested mode (trustless — tokens held by Vault)

### Test Plan
1. **ONCHAINID deploy:** verify CREATE2 address matches pre-computed address
2. **Claim signing:** verify signature validates against deployer address on-chain
3. **Claim expiry:** issue claim with 1-year expiry, verify `getClaimData()` returns correct expiry
4. **Identity registration:** verify `identityRegistry.isVerified(wallet)` returns true after full flow
5. **Trustless claim (Direct):** contribute → finalize → claimTokens() → tokens in investor wallet (no deployer involvement)
6. **Trustless claim (Vested):** contribute → finalize → vault.claim() → fractions burned, project tokens released

### Seed Data Requirements
- ONCHAINID Factory contract deployed
- ClaimTopicsRegistry with topics [1, 2, 3]
- TrustedIssuersRegistry with platform as trusted issuer
- 3 test users with completed KYC (Sumsub mock data)

---

#### Task 3.1: Fix CREATE2 Identity Address Computation
**Priority:** CRITICAL
**Definition of Done:**
- `web3_identity_service.py` (line 85-90) updated: `_compute_identity_address()` uses proper CREATE2 formula: `keccak256(0xff ++ factory_address ++ salt ++ keccak256(init_code))`
- Salt derived from user wallet address (deterministic per wallet)
- Computed address matches actual deployed address (verified in test)
- Test: compute address off-chain, deploy via factory, verify addresses match

**Files to modify:**
- `apps/api/services/web3_identity_service.py` (lines 85-90 — replace placeholder)

**Dependencies:** None

---

#### Task 3.2: Real ECDSA Claim Signing
**Priority:** CRITICAL
**Definition of Done:**
- `web3_identity_service.py` (line 175) updated: `issue_kyc_claims()` signs claims using `eth_account.Account.sign_message()` with deployer private key
- Claim data structure: `(identity_address, topic_id, data)` → hash → sign → signature
- Signature format compatible with ONCHAINID's `ClaimIssuer.isClaimValid()` check
- Claims issued with expiry timestamp (default: `now + 365 days`)
- Country claim issued alongside KYC claim (topic 2, data = country code from Sumsub)
- Test: sign claim off-chain, verify on-chain via `ClaimIssuer.isClaimValid()`

**Files to modify:**
- `apps/api/services/web3_identity_service.py` (lines 160-200 — replace placeholder signature)

**Dependencies:** Task 3.1 (need correct identity address)

---

#### Task 3.3: Complete Identity Registration Flow
**Priority:** CRITICAL
**Definition of Done:**
- Full flow in `web3_identity_service.py`:
  1. Deploy ONCHAINID via factory (CREATE2)
  2. Add KYC claim (topic 1) with real signature + expiry
  3. Add country claim (topic 2) with real signature + expiry
  4. Register wallet→identity in IdentityRegistry
  5. Store identity address on user model (`onchain_identity_address` field)
- Idempotent: calling twice for same user doesn't fail (checks if identity exists first)
- Called automatically on KYC approval webhook (from `kyc_service.py`)
- Test: full flow → `identityRegistry.isVerified(wallet)` returns true

**Files to modify:**
- `apps/api/services/web3_identity_service.py` (major refactor — currently 271 lines, ~200 lines of changes)
- `apps/api/services/kyc_service.py` — ensure webhook handler calls identity registration
- `apps/api/models/user.py` — add `onchain_identity_address` field if not present

**Dependencies:** Tasks 3.1, 3.2

---

#### Task 3.4: Trustless Token Claims via Sale Contract
**Priority:** CRITICAL
**Definition of Done:**
- For Direct mode: `Sale.claimTokens()` called by investor directly (tokens held by Sale contract after `contribute()` auto-transfers — but for edge cases where auto-finalize happens)
- For Vested mode: investor calls `CiretaVault.claim()` directly — no backend involvement needed
- Backend `claim_tokens()` method in `sale_contribute_service.py` (lines 276-315) updated:
  - Does NOT use `forcedTransfer()` anymore (remove this path)
  - For Direct: guides user to call `Sale.claimTokens()` on-chain, then records claim from receipt
  - For Vested: guides user to call `CiretaVault.claim()` on-chain, then records claim from receipt
- Frontend claim button calls contract directly via wagmi
- Test: contribute → finalize → claim (both modes) → tokens in wallet without any admin/deployer action

**Files to modify:**
- `apps/api/services/sale_contribute_service.py` (lines 276-315 — remove forcedTransfer, add on-chain claim verification)
- `apps/launchpad/src/app/portfolio/claim/[token]/page.tsx` — add direct contract call via wagmi

**Files to create:**
- `apps/launchpad/src/lib/contracts/vaultAbi.ts` (new — Vault ABI export)

**Dependencies:** Sprint 2 (vault exists), Task 3.3 (KYC claims valid for on-chain transfer)

---

#### Task 3.5: Claim Expiry on ONCHAINID
**Priority:** HIGH
**Definition of Done:**
- All claims issued with `expiry` parameter (Unix timestamp, default `now + 365 days`)
- `kyc_expires_at` on user model set to match claim expiry
- Backend reads claim expiry from on-chain `getClaimData()` for verification
- Test: issue claim with 1-year expiry, verify expiry matches on-chain

**Files to modify:**
- `apps/api/services/web3_identity_service.py` — add expiry to claim issuance
- `apps/api/services/kyc_service.py` — set `kyc_expires_at` on user after claim issuance

**Dependencies:** Task 3.2

---

## Sprint 4: Refunds via Sale Contract, Dividend Backend, Event Listeners

> **Completes the Sale lifecycle** (contribute → finalize → claim OR refund) and adds chain sync so DB never diverges from on-chain state.

### Entry Criteria
- Sprint 1-3 complete: contribute, claim, and identity all working on-chain
- At least one successful test sale completed end-to-end on testnet

### Sprint Definition of Done
- Failed sale refunds work trustlessly: investor calls `Sale.claimRefund()` on-chain, gets USDC back
- Vested sale refunds burn fraction tokens before refunding
- Dividend distribution: issuer deposits USDC, investors claim proportionally
- Event listener syncs on-chain events to DB within 30 seconds
- Balance reconciliation catches any DB/chain drift

### Test Plan
1. **Refund flow:** Create sale → contribute → don't reach soft cap → finalize → claimRefund → USDC back in wallet
2. **Vested refund:** Same but verify fractions burned
3. **Dividend flow:** Deposit USDC to DividendDistributor → claim dividend → USDC in wallet
4. **Event listener:** Contribute on-chain → verify DB updated within 30s without explicit API call
5. **Reconciliation:** Manually alter DB balance → run reconciliation → discrepancy flagged

### Seed Data Requirements
- One sale that intentionally fails (contributes below soft cap)
- One finalized sale with token holders for dividend testing
- DividendDistributor deployed with test USDC deposit

---

#### Task 4.1: Trustless Refund Flow
**Priority:** CRITICAL
**Definition of Done:**
- Frontend refund button calls `Sale.claimRefund()` on-chain via wagmi (not backend API)
- Backend `refund_contribution()` in `sale_contribute_service.py` (lines 372-410):
  - Removes `transfer()` call on USDC from deployer wallet
  - Instead: verifies `RefundClaimed` event from tx receipt
  - Updates contribution status to `REFUNDED` in DB after on-chain confirmation
- For Vested mode: contract burns fractions in `claimRefund()` — backend verifies `FractionsBurned` event
- Test: fail a sale → refund → verify USDC balance restored and DB updated

**Files to modify:**
- `apps/api/services/sale_contribute_service.py` (lines 372-410 — remove deployer transfer)
- `apps/launchpad/src/app/portfolio/claim/[token]/page.tsx` — add refund button for failed sales

**Dependencies:** Sprint 1 (contribute works), Sprint 2 (vested mode for fraction burn)

---

#### Task 4.2: Dividend Distribution Backend
**Priority:** HIGH
**Definition of Done:**
- New file `apps/api/services/dividend_service.py` exists
- `deposit_dividend(token_id, usdc_amount)` — issuer deposits USDC to DividendDistributor contract on-chain
- `get_claimable_dividends(user_wallet, token_address)` — reads on-chain claimable amount per epoch
- `claim_dividend(user_wallet, token_address, epoch)` — guides user to call contract, records claim
- API endpoints:
  - `POST /admin/dividends/{token_id}/deposit` — issuer deposits
  - `GET /portfolio/dividends` — returns real claimable amounts (replaces hardcoded empty list at `portfolio.py:205-219`)
- Test: deposit → query claimable → claim → verify USDC received

**Files to create:**
- `apps/api/services/dividend_service.py` (~150 lines)

**Files to modify:**
- `apps/api/api/v1/endpoints/portfolio.py` (lines 205-219 — replace stub with real implementation)
- `apps/api/api/v1/endpoints/admin_operations.py` — add dividend deposit endpoint
- `apps/launchpad/src/app/portfolio/dividends/page.tsx` — wire to real API data

**Dependencies:** DividendDistributor.sol already exists (`contracts/src/token/DividendDistributor.sol`)

---

#### Task 4.3: Event Listener / Blockchain Poller
**Priority:** HIGH
**Definition of Done:**
- New file `apps/api/services/event_listener_service.py` exists
- Polls Base RPC every 12 seconds (one block) for events:
  - `ContributionMade` → upsert contribution in DB
  - `TokensClaimed` → mark contribution as claimed
  - `RefundClaimed` → mark contribution as refunded
  - `SaleFinalized` → update sale status
  - `Transfer` (on CiretaToken) → update portfolio balances
  - `FractionsMinted` / `FractionsBurned` → update fraction balances
- Stores `last_synced_block` in Redis for resume after restart
- Runs as background worker task (arq — existing worker framework)
- Test: emit events on Hardhat fork → verify DB updated

**Files to create:**
- `apps/api/services/event_listener_service.py` (~200 lines)

**Files to modify:**
- `apps/api/workers/tasks.py` — add `task_sync_chain_events()` with 12s interval
- `apps/api/workers/worker.py` — register new task

**Dependencies:** Sprint 1 (contract registry for ABI access)

---

#### Task 4.4: Balance Reconciliation Task
**Priority:** MEDIUM
**Definition of Done:**
- New background task `task_reconcile_balances()` runs daily
- For each user with holdings: compare DB portfolio balance vs on-chain `balanceOf()`
- For vested holdings: compare DB fraction balance vs on-chain fraction `balanceOf()`
- Log discrepancies to `audit_logs` table with severity level
- Send admin notification if discrepancy found (via notification_service)
- Test: manually alter DB balance → run reconciliation → verify discrepancy logged

**Files to modify:**
- `apps/api/workers/tasks.py` — add `task_reconcile_balances()`
- `apps/api/services/portfolio_service.py` — add `reconcile_balances()` method

**Dependencies:** Task 4.3 (event listener provides baseline sync)

---

#### Task 4.5: Webhook Retry + Dead Letter Queue
**Priority:** MEDIUM
**Definition of Done:**
- New model `webhook_event.py`: `id`, `provider` (sumsub/etc), `payload` (JSON), `status` (pending/processed/failed), `attempts`, `last_error`, `created_at`, `processed_at`
- Sumsub webhook endpoint (`kyc.py`) stores raw payload first, then processes async
- Worker task `task_process_webhook()` with 3 retries, exponential backoff (1s, 4s, 16s)
- Failed after 3 retries → status=failed, visible in admin
- Admin endpoint: `POST /admin/webhooks/{id}/replay` — re-processes failed webhook
- Test: simulate webhook failure → verify retry → verify DLQ entry

**Files to create:**
- `apps/api/models/webhook_event.py` (~30 lines)

**Files to modify:**
- `apps/api/api/v1/endpoints/kyc.py` — store before process
- `apps/api/workers/tasks.py` — add webhook processing task
- `apps/api/api/v1/endpoints/admin_operations.py` — add replay endpoint
- `infra/alembic/versions/` — new migration for webhook_event table

**Dependencies:** None

---

## Sprint 5: Wallet Screening, MFA, Safe/Multisig, KYC Expiry

> **Security hardening** for a regulated financial platform. Can be parallelized with Sprint 2-3.

### Entry Criteria
- Sprint 1 complete (core flow works — screening hooks need a working contribute flow)
- Auth service working (MFA adds to existing auth)

### Sprint Definition of Done
- Wallets screened on link + before contribution (blocks sanctioned addresses)
- MFA available for all users, mandatory for admin/issuer
- Safe wallets detected, adapted UX for multisig
- KYC expiry monitored, re-verification reminders sent

### Test Plan
1. **Wallet screening:** Link sanctioned address → blocked. Contribute from flagged wallet → blocked.
2. **MFA:** Enable TOTP → verify code → access admin. Wrong code → denied.
3. **Safe detection:** Connect Safe wallet → see "Propose Transaction" instead of "Confirm"
4. **KYC expiry:** Set kyc_expires_at to yesterday → contribute → blocked. Set to 30 days from now → reminder sent.

### Seed Data Requirements
- Known sanctioned test addresses (from screening provider test mode)
- TOTP secret for test user
- Safe wallet on Base Sepolia

---

#### Task 5.1: Wallet Screening Service
**Priority:** CRITICAL
**Definition of Done:**
- New file `apps/api/services/wallet_screening_service.py` exists
- `screen_address(address)` — calls screening provider API (Chainalysis KYT or similar), returns risk assessment
- `check_sanctions(address)` — checks OFAC/SDN lists, returns boolean
- Screening triggered on:
  - Wallet link (`wallet_service.py` — `link_wallet()`) — blocks if sanctioned
  - Before contribution (`sale_contribute_service.py`) — blocks if risk above threshold
- Risk scores stored on wallet model (new field: `risk_score`, `last_screened_at`)
- Daily re-screening task for all linked wallets
- Configurable thresholds via env vars (`SCREENING_BLOCK_THRESHOLD`, `SCREENING_FLAG_THRESHOLD`)
- Test: mock provider responses, verify block/allow logic

**Files to create:**
- `apps/api/services/wallet_screening_service.py` (~120 lines)

**Files to modify:**
- `apps/api/services/wallet_service.py` — call screening on link
- `apps/api/services/sale_contribute_service.py` — call screening before contribute
- `apps/api/models/wallet.py` — add `risk_score`, `last_screened_at`
- `apps/api/workers/tasks.py` — add `task_rescreen_wallets()` daily
- `infra/alembic/versions/` — new migration

**Dependencies:** Sprint 1 (contribute flow must exist for pre-contribute screening)

---

#### Task 5.2: MFA / Two-Factor Authentication
**Priority:** HIGH
**Definition of Done:**
- `apps/api/services/mfa_service.py` exists with:
  - `setup_mfa(user)` — generates TOTP secret, returns QR code URI
  - `verify_mfa(user, code)` — validates 6-digit TOTP code
  - `generate_backup_codes(user)` — generates 8 one-time backup codes
- User model: `mfa_secret` (EncryptedString), `mfa_enabled` (bool), `mfa_backup_codes` (EncryptedString)
- Auth flow: if user has MFA enabled, login returns `requires_mfa: true` + partial JWT; second call with code completes auth
- Admin/issuer routes: middleware enforces MFA (403 if not enabled)
- Settings page: enable/disable MFA with QR code display
- Test: setup → verify → login with MFA → access admin; login without MFA code → denied

**Files to create:**
- `apps/api/services/mfa_service.py` (~100 lines)

**Files to modify:**
- `apps/api/models/user.py` — add mfa fields
- `apps/api/api/v1/endpoints/auth.py` — add MFA setup/verify endpoints + MFA check in login
- `apps/api/services/auth_service.py` — add MFA verification step
- `apps/launchpad/src/app/settings/security/page.tsx` — MFA setup UI (new page)
- `infra/alembic/versions/` — new migration

**Dependencies:** None

---

#### Task 5.3: Safe / Multisig Wallet Detection
**Priority:** MEDIUM
**Definition of Done:**
- `Web3Context.tsx` updated: on wallet connect, calls `eth_getCode(address)` — if bytecode exists, address is a contract (likely Safe)
- State: `isSafe: boolean` available in context
- UI adapts: "Propose Transaction" instead of "Confirm Transaction" for Safe wallets
- InvestFlow: for Safe wallets, uses Safe Protocol Kit to propose tx instead of direct execution
- Install: `@safe-global/protocol-kit`, `@safe-global/api-kit`
- Test: connect EOA → normal flow; connect Safe → adapted flow

**Files to modify:**
- `apps/launchpad/src/contexts/Web3Context.tsx` — add Safe detection
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` — conditional UI for Safe

**Files to create:**
- `apps/launchpad/src/lib/safe/safeClient.ts` (~80 lines — propose/execute helpers)

**Dependencies:** Sprint 1 (InvestFlow must have on-chain calls to adapt)

---

#### Task 5.4: KYC Expiry Monitoring
**Priority:** MEDIUM
**Definition of Done:**
- Background task `task_check_kyc_expiry()` runs daily
- Queries users where `kyc_expires_at` is within 30 days or already past
- 30-day warning: sends email via `email_service.py` with re-verification link
- Expired: sets `kyc_level = 0` (or flags `kyc_expired = true`), blocks contribution
- `sale_contribute_service.py` checks `kyc_expires_at` before allowing contribution
- Test: set expiry to 20 days from now → warning email sent; set expiry to yesterday → contribution blocked

**Files to modify:**
- `apps/api/workers/tasks.py` — add `task_check_kyc_expiry()`
- `apps/api/services/sale_contribute_service.py` — add expiry check
- `apps/api/services/kyc_service.py` — set expiry on approval
- `apps/api/services/email_service.py` — add KYC expiry reminder template

**Dependencies:** Task 3.5 (claims issued with expiry)

---

#### Task 5.5: Web3 RPC Circuit Breaker
**Priority:** MEDIUM
**Definition of Done:**
- New file `apps/api/core/web3_provider.py` exists
- Circuit breaker: after 5 consecutive RPC failures in 60s → open circuit for 30s → return "Service temporarily unavailable" (503)
- Fallback RPC URL: if primary fails, try secondary (env var `WEB3_FALLBACK_RPC_URL`)
- All web3 services use this provider instead of direct `Web3()` instantiation
- Health check endpoint reports RPC status
- Test: mock RPC failures → verify circuit opens → verify fallback used

**Files to create:**
- `apps/api/core/web3_provider.py` (~80 lines)

**Files to modify:**
- `apps/api/services/web3_base_service.py` — use new provider
- `apps/api/api/v1/endpoints/health.py` — add RPC health check

**Dependencies:** None

---

## Sprint 6: Frontend Completion — Phase Timeline, Compliance Acknowledgment, Full Data Flow

> **Makes the frontend match the spec** — all tabs, all data flows, all visual components.

### Entry Criteria
- Sprints 1-3 complete: on-chain contribute, claim, and identity all working
- API endpoints for portfolio, vesting, dividends returning real data

### Sprint Definition of Done
- Phase timeline visualization on project detail page
- Compliance acknowledgment checkbox in invest flow
- All 6 project detail tabs rendering real data
- Portfolio pages show real on-chain data (not stubs)
- Settings pages functional

### Test Plan
1. **Phase timeline:** View project → see Seed/Private/Retail phases with dates and progress
2. **Compliance checkbox:** Invest flow → Step 2 has checkbox → cannot proceed without checking
3. **All tabs:** Project detail → click each of 6 tabs → data renders correctly
4. **Portfolio:** Holdings show real balances, dividends show real claimable, vesting shows real schedule
5. **Browser test:** Full investor journey from registration → KYC → invest → portfolio

### Seed Data Requirements
- Project with 3 phases (Seed/Private/Retail) at different prices
- Finalized sale with claimed tokens
- Active vesting schedule
- Pending dividend distribution

---

#### Task 6.1: Phase Timeline Visualization
**Priority:** HIGH
**Definition of Done:**
- New component `PhaseTimeline.tsx` renders horizontal timeline of sale phases
- Shows: phase name, dates, price per token, allocation, sold/remaining
- Current phase highlighted with accent color
- Past phases grayed with sold stats
- Future phases shown with "Upcoming" badge
- Responsive: stacks vertically on mobile
- Used on project detail page (`apps/launchpad/src/app/project/[slug]/page.tsx`)
- Test: renders 3 phases correctly, highlights active phase

**Files to create:**
- `apps/launchpad/src/components/molecules/PhaseTimeline.tsx` (~120 lines)

**Files to modify:**
- `apps/launchpad/src/app/project/[slug]/page.tsx` — integrate PhaseTimeline in phases tab

**Dependencies:** API returns phase data (already working)

---

#### Task 6.2: Compliance Acknowledgment in InvestFlow
**Priority:** HIGH
**Definition of Done:**
- Step 2 (review) of InvestFlow includes:
  - Text: "This investment involves regulated securities. You acknowledge that..."
  - Checkbox: "I understand and accept the risks associated with this investment"
  - Checkbox: "I confirm I am not a resident of a restricted jurisdiction"
  - Both must be checked to proceed
- Acknowledgment timestamp stored in contribution record (`acknowledged_at` field)
- Test: cannot proceed without checking both boxes; timestamp saved

**Files to modify:**
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` — add checkboxes to step 2
- `apps/api/models/contribution.py` — add `acknowledged_at` field
- `infra/alembic/versions/` — new migration

**Dependencies:** None

---

#### Task 6.3: Complete Project Detail Tabs
**Priority:** HIGH
**Definition of Done:**
- 6 tabs on project detail page:
  1. Overview (✅ existing)
  2. Phases (✅ existing — enhance with PhaseTimeline from 6.1)
  3. Documents (✅ existing)
  4. Team (✅ existing)
  5. **Financials** (NEW): total raised, fee structure, cap table, revenue projections
  6. **Token Details** (NEW): token address, standard (ERC-3643), compliance modules, identity registry, transfer restrictions
- Each tab fetches relevant API data
- Test: all 6 tabs render without errors, show real data

**Files to modify:**
- `apps/launchpad/src/app/project/[slug]/page.tsx` (line 113 — add 2 new tabs)

**Dependencies:** Task 6.1 (PhaseTimeline for phases tab)

---

#### Task 6.4: Portfolio Pages — Real Data Integration
**Priority:** HIGH
**Definition of Done:**
- Holdings page: shows real `balanceOf()` from chain (via event listener DB) — not just DB contribution amounts
- Vesting page: shows real claimable amounts from vault contract
- Dividends page: shows real claimable dividends from DividendDistributor
- Transactions page: shows all on-chain tx hashes with BaseScan links
- All pages handle loading states, empty states, and errors gracefully
- Test: verify each page with seeded data

**Files to modify:**
- `apps/launchpad/src/app/portfolio/holdings/page.tsx`
- `apps/launchpad/src/app/portfolio/vesting/page.tsx`
- `apps/launchpad/src/app/portfolio/dividends/page.tsx`
- `apps/launchpad/src/app/portfolio/transactions/page.tsx`
- `apps/launchpad/src/lib/api/repositories/portfolio.repository.ts`

**Dependencies:** Sprint 4 (event listener populates DB with real data), Task 4.2 (dividend service)

---

#### Task 6.5: Settings Pages — Functional Implementation
**Priority:** MEDIUM
**Definition of Done:**
- Profile page: edit name, email; view KYC tier; view linked wallets
- Verification page: show KYC status, tier level, expiry date; link to re-verify
- Notifications page: toggle email preferences (investment confirmations, sale updates, KYC reminders)
- Wallets page: already exists — verify it shows screening status (from Task 5.1)
- Test: update profile → API call succeeds; toggle notification → preference saved

**Files to modify:**
- `apps/launchpad/src/app/settings/profile/page.tsx`
- `apps/launchpad/src/app/settings/verification/page.tsx`
- `apps/launchpad/src/app/settings/notifications/page.tsx`

**Dependencies:** None (API endpoints mostly exist)

---

## Sprint 7: Seed Data + E2E Testing + Production Hardening

> **The final sprint before launch.** Ensures everything works together, edge cases are covered, and the platform is production-grade.

### Entry Criteria
- Sprints 1-6 complete: all features working individually
- All unit tests passing
- All contract tests passing
- Base Sepolia testnet deployment active

### Sprint Definition of Done
- Comprehensive seed data covering all flows
- E2E test suite covering the 5 critical user journeys
- Sentry integrated for error tracking
- CI/CD deploys to staging automatically
- Production deployment checklist documented and verified

### Test Plan
1. **E2E Journey 1 — New Investor:** Register → KYC → Link wallet → Browse → Invest (Direct) → Claim tokens
2. **E2E Journey 2 — Vested Investor:** Invest (Vested) → See fractions → Wait for cliff → Partial claim → Full claim
3. **E2E Journey 3 — Failed Sale:** Invest → Sale fails → Claim refund → USDC restored
4. **E2E Journey 4 — Issuer:** Login → Create token → Deploy → Create sale → Manage whitelist → View contributions → Finalize
5. **E2E Journey 5 — Admin:** Login → View analytics → Manage issuers → Compliance actions → System health

### Seed Data Requirements
See Task 7.1 for comprehensive seed data script

---

#### Task 7.1: Comprehensive Seed Data Script
**Priority:** CRITICAL
**Definition of Done:**
- `scripts/seed.py` (exists — currently basic) expanded to create:
  - 3 users: investor (KYC'd), issuer (whitelisted), admin
  - 2 tokens: "Wassa Gold" (WMAU, commodity, 2880 supply) and "Dubai Towers" (DTWR, real estate, 10000 supply)
  - 3 sales: WMAU vested (active), DTWR direct (finalized), WMAU direct (failed)
  - Contributions for each sale
  - Vesting schedules for vested sale
  - Whitelist entries for seed phases
  - ONCHAINID records for test users
  - Wallet records for test users
- Script can seed both DB and blockchain (deploys test contracts on local Hardhat node)
- Idempotent: running twice doesn't create duplicates
- Test: run seed → verify all entities exist → run again → no errors

**Files to modify:**
- `scripts/seed.py` (major expansion — currently ~50 lines → ~300 lines)

**Dependencies:** Sprints 1-6 (all models and services must exist)

---

#### Task 7.2: E2E Test Suite
**Priority:** CRITICAL
**Definition of Done:**
- 5 E2E test scripts using Playwright or browser tool:
  1. `test_investor_direct_flow.py` — register → KYC → invest (direct) → claim
  2. `test_investor_vested_flow.py` — invest (vested) → check fractions → claim after vest
  3. `test_failed_sale_refund.py` — invest → fail → refund
  4. `test_issuer_flow.py` — create token → deploy → create sale → finalize
  5. `test_admin_flow.py` — analytics → compliance → health
- Each test starts from seeded state
- Tests run against local Hardhat + local API + local frontend
- CI integration: tests run on PR (optional — can be manual for now)

**Files to create:**
- `tests/e2e/test_investor_direct_flow.py`
- `tests/e2e/test_investor_vested_flow.py`
- `tests/e2e/test_failed_sale_refund.py`
- `tests/e2e/test_issuer_flow.py`
- `tests/e2e/test_admin_flow.py`
- `tests/e2e/conftest.py` (shared fixtures)

**Dependencies:** Task 7.1 (seed data)

---

#### Task 7.3: Sentry Error Tracking Integration
**Priority:** HIGH
**Definition of Done:**
- Backend: `sentry-sdk[fastapi]` installed, configured in `apps/api/main.py`
- Launchpad: `@sentry/nextjs` installed, configured in `apps/launchpad/next.config.ts`
- Admin: same as launchpad
- Captures: unhandled exceptions, slow transactions (>5s), breadcrumbs for API calls
- User context: user_id, email, role attached to events
- Test: trigger intentional error → verify it appears in Sentry dashboard

**Files to modify:**
- `apps/api/main.py` — add Sentry initialization
- `apps/launchpad/next.config.ts` — add Sentry plugin
- `apps/admin/next.config.ts` — add Sentry plugin

**Files to create:**
- `apps/launchpad/sentry.client.config.ts`
- `apps/launchpad/sentry.server.config.ts`
- `apps/admin/sentry.client.config.ts`
- `apps/admin/sentry.server.config.ts`

**Dependencies:** None

---

#### Task 7.4: CI/CD Pipeline Enhancement
**Priority:** HIGH
**Definition of Done:**
- Existing `.github/workflows/ci.yml` (4 jobs) enhanced:
  - Add linting: `ruff check .` for Python, `npx tsc --noEmit` for TS
  - Add contract deployment test on Hardhat fork
- New: `.github/workflows/deploy-staging.yml` — auto-deploy on merge to `develop`
- New: `.github/workflows/deploy-production.yml` — manual trigger, deploy to production
- Deploy workflow includes: build → test → deploy → health check → rollback on failure
- Test: merge to develop → staging deployed automatically → health check passes

**Files to modify:**
- `.github/workflows/ci.yml` — add lint jobs

**Files to create:**
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

**Dependencies:** None

---

#### Task 7.5: Production Deployment Checklist
**Priority:** HIGH
**Definition of Done:**
- `docs/DEPLOYMENT.md` exists with:
  - Pre-deployment: contract deployment order, address verification, role grants
  - Environment variables: complete list with descriptions
  - Database: migration procedure, backup verification
  - Monitoring: Sentry DSN, health check URLs, alert configuration
  - Security: deployer key in KMS (not file), CORS origins, rate limits
  - Rollback: procedure for each component (API, frontend, contracts)
  - Post-deployment: smoke test checklist (5 API calls + 5 frontend checks)
- All env vars documented in `.env.example` files
- Test: follow checklist on staging → everything works

**Files to create:**
- `docs/DEPLOYMENT.md` (~200 lines)
- `.env.backend.example` (updated)
- `.env.launchpad.example` (updated)
- `.env.admin.example` (updated)

**Dependencies:** Sprints 1-6 (need to know all configuration)

---

#### Task 7.6: Database Backup + HSM/KMS for Deployer Key
**Priority:** MEDIUM
**Definition of Done:**
- Database backup: automated daily PostgreSQL pg_dump with 30-day retention
- Restore procedure documented and tested
- Deployer key: migrated from file to AWS KMS (or equivalent)
- `web3_tx_service.py` signs transactions via KMS API instead of local key file
- Test: backup → restore → verify data integrity; sign tx via KMS → verify on-chain

**Files to modify:**
- `apps/api/services/web3_tx_service.py` — add KMS signing path

**Files to create:**
- `scripts/backup-db.sh`
- `docs/DEPLOYMENT.md` (backup section)

**Dependencies:** Task 1.2 (tx service exists)

---

## Cross-Cutting Concerns (Every Sprint)

### Test Coverage Target
- Smart contracts: 100% of public function paths
- Backend services: 80%+ line coverage
- Frontend: Vitest tests for InvestFlow, VaultClaim, SafeTxTracker

### Audit Protocol (Run After Each Sprint)
```bash
cd /Users/zephyroc/projects/cireta
ruff check apps/ packages/ tests/
python -c "from apps.api.main import app"
poetry run pytest tests/ -x -q
cd apps/launchpad && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
cd contracts && npx hardhat test
```

### BUILD_LOG.md Updates
After every sprint completion, append results to `docs/BUILD_LOG.md`.

---

## Items Explicitly Deferred (Phase 3+)

| Feature | Reason |
|---------|--------|
| P2P Order Board | Phase 3 — requires ATS legal analysis |
| ATS Partnership (tZERO/Securitize) | Phase 3 — partnership negotiation |
| Fiat On-Ramp (MoonPay/Transak) | Phase 3 — additional KYC integration |
| Cross-Chain Deployment | Phase 3 — after Base mainnet proven |
| Compliant DEX (Uniswap V4 hooks) | Phase 4 — R&D |
| DeFi Integrations | Phase 4 — R&D |
| Third-Party Public API | Phase 4 — after internal APIs stable |
| White-Label / Per-Issuer Subdomain | Phase 4 — scale feature |
| Prometheus + Grafana metrics | Post-launch — Sentry sufficient for MVP |
| The Graph subgraph connection | Post-Sprint 7 — event listener sufficient for MVP |
| Google OAuth | Post-launch — email+password sufficient for MVP |
| Timelock for admin operations | Post-launch — multisig provides governance initially |
