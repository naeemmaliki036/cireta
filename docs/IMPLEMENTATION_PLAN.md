# Cireta Platform — Implementation Plan

> **Date:** 2026-03-23
> **Inputs:** SPEC_GAP_ANALYSIS.md, CRITICAL_ANALYSIS.md, SALE_ARCHITECTURE_V2.md, Raise Lifecycle PDF
> **Goal:** Close all gaps to reach production-ready state for Phase 1 + Phase 2

---

## How to Read This Document

Each work item is a discrete, implementable unit. Items are grouped into **Sprints** (roughly 1-2 weeks each) ordered by dependency and priority. Each item includes:

- **What:** The deliverable
- **Where:** Files to create or modify
- **Depends on:** Prior items that must be complete
- **Acceptance:** How to verify it's done

---

## Sprint 0 — Critical Bugs & Foundation (Week 1)

These items unblock everything else. No feature work until Sprint 0 is green.

### 0.1 Fix Whitelist Validation Bug
**What:** `wallet_address` is undefined at `sale_contribute_service.py:108`, causing `NameError` on whitelist-only phases.
**Where:** `apps/api/services/sale_contribute_service.py`
**Acceptance:** Whitelist-only phase contribution works without crash. Unit test covering whitelist path.

### 0.2 Contract Address Storage on Token Model
**What:** Add per-token storage of all deployed contract addresses so the backend can interact with them.
**Where:**
- `apps/api/models/token.py` — add fields: `identity_registry_address`, `compliance_address`, `sale_contract_address`, `vault_address`, `fraction_token_address`
- `apps/api/schemas/token.py` — update response schemas
- `infra/alembic/` — new migration
**Acceptance:** Token model stores all contract addresses. API returns them in token detail response.

### 0.3 ABI Loader + Contract Registry
**What:** Load compiled ABIs from Hardhat artifacts. Provide a registry mapping contract names to addresses per environment.
**Where:**
- `apps/api/core/contract_registry.py` — new file: loads ABIs from `contracts/artifacts/`, maps deployed addresses from env/config
- `apps/api/core/abi/` — new directory: copy compiled ABI JSON files from Hardhat build
- `packages/common/config/defaults.py` — add contract address defaults
**Depends on:** 0.2
**Acceptance:** `ContractRegistry.get_contract("CiretaToken", token_address)` returns a ready-to-call web3 contract instance.

### 0.4 Redis JWT Blacklist
**What:** Implement token revocation via Redis set. On logout/refresh, add old token hash to Redis with TTL matching token expiry.
**Where:** `apps/api/services/auth_service.py` (line 135 TODO), `packages/common/core/cache.py`
**Acceptance:** After logout, old access token returns 401 within 1 second (not 15 minutes).

### 0.5 Sale Model Fields from Spec
**What:** Add missing fields to the sale and contribution data models.
**Where:**
- `apps/api/models/token_sale.py` — add: `total_raised_on_platform`, `platform_fee_bps`, `fee_cap_usdc`, `platform_fee_collected`, `sale_mode` (enum: direct/vested), `vault_address`, `fraction_token_address`
- `apps/api/models/contribution.py` — add: `is_otc` boolean
- `apps/api/models/vesting_schedule.py` — add: `is_revocable`, `is_revoked`
- `apps/api/models/redemption_request.py` — add: `rejection_reason`, `delivery_details` (EncryptedString)
- `apps/api/models/user.py` — add: `is_accredited` boolean
- `apps/api/models/token.py` — add: `image_url`, `description`
- `infra/alembic/` — migration for all above
**Acceptance:** All fields exist, migration runs cleanly, API schemas updated.

---

## Sprint 1 — Sale Architecture V2: Contracts (Week 2-3)

Implement the new dual-mode sale with vault + fraction tokens per SALE_ARCHITECTURE_V2.md.

### 1.1 CiretaFractionToken Contract
**What:** Lightweight gated ERC-20 receipt token. KYC-gated via shared IdentityRegistry. MINTER_ROLE for Sale, BURNER_ROLE for Vault.
**Where:** `contracts/src/fraction/CiretaFractionToken.sol`
**Acceptance:** Deploys, mints to KYC'd address, blocks transfer to non-KYC'd address, burns via BURNER_ROLE. Hardhat tests pass.

### 1.2 CiretaVault Contract
**What:** Vault with configurable ExcessPolicy (Keep vs BurnToMatch), vesting (cliff + linear), burn-to-release claim. Per SALE_ARCHITECTURE_V2.md section 2.2.
**Where:** `contracts/src/vault/CiretaVault.sol`
**Acceptance:**
- `depositTokens()` locks project tokens
- `recordAllocation()` tracks per-investor amounts
- `startVesting()` begins vesting clock
- `claim()` burns fractions + releases project tokens
- `handlePhaseExcess()` respects ExcessPolicy
- `withdrawExcess()` only works post-finalization with guard
- Hardhat tests for both policies + edge cases

### 1.3 Updated Sale Contract (Dual Mode)
**What:** Add `SaleMode` (Direct vs Vested) to existing Sale.sol. In Direct mode, `contribute()` transfers project token immediately. In Vested mode, `contribute()` mints fractions + records in vault.
**Where:** `contracts/src/sale/Sale.sol` — modify existing
**Acceptance:**
- Direct mode: contribute transfers token immediately, no fraction involved
- Vested mode: contribute mints fraction, vault tracks allocation
- `_finalize()` starts vesting clock if Vested
- `claimRefund()` burns fractions on failed vested sale
- All existing Sale tests still pass
- New tests for both modes

### 1.4 CiretaFractionFactory Contract
**What:** Deploys fraction token + vault pairs via UUPS proxies. Grants MINTER_ROLE to Sale, BURNER_ROLE to Vault.
**Where:** `contracts/src/platform/CiretaFractionFactory.sol`
**Acceptance:** Single call deploys fraction + vault, roles granted correctly, tracked in factory state.

### 1.5 Update CiretaSaleFactory
**What:** Pass `saleMode` in `deploySale()`. For Vested mode, coordinate with CiretaFractionFactory to deploy vault + fraction.
**Where:** `contracts/src/platform/CiretaSaleFactory.sol` — modify existing
**Acceptance:** `deploySale(mode=Vested)` deploys Sale + Vault + Fraction in correct order with all bindings.

### 1.6 Deployment Script Update
**What:** Update `contracts/scripts/deploy.ts` to deploy new implementations (FractionToken, Vault) and FractionFactory.
**Where:** `contracts/scripts/deploy.ts`
**Acceptance:** Full deployment script outputs all addresses including new contracts.

---

## Sprint 2 — Web3 Bridge: Backend ↔ Blockchain (Week 3-4)

Wire up the backend to actually call the smart contracts.

### 2.1 Web3 Token Service — Real Deployment
**What:** Replace placeholder in `deploy_erc3643_token()` with actual `CiretaTokenFactory.deployToken()` call via web3.py. Store all returned addresses (token, identityRegistry, compliance) on the token model.
**Where:** `apps/api/services/web3_token_service.py`
**Depends on:** 0.2, 0.3
**Acceptance:** `POST /tokens/{id}/deploy` deploys real ERC-3643 token on Base. Contract addresses stored in DB and returned via API.

### 2.2 Web3 Sale Service — Sale Deployment + Contribute
**What:** New service that deploys Sale contracts via SaleFactory, handles vault/fraction setup for vested mode, and provides `contribute()` orchestration.
**Where:** `apps/api/services/web3_sale_service.py` — new file
**Depends on:** 1.3, 1.5, 2.1
**Acceptance:**
- `deploy_sale(mode=Direct)` deploys Sale, issuer deposits project tokens
- `deploy_sale(mode=Vested)` deploys Sale + Vault + Fraction, issuer deposits to vault
- `record_contribution(tx_hash)` verifies on-chain contribution event matches DB record

### 2.3 Web3 Identity Service — Complete Implementation
**What:** Fix CREATE2 computation, implement `register_identity()`, implement `issue_kyc_claims()` with claim expiry timestamps.
**Where:** `apps/api/services/web3_identity_service.py`
**Depends on:** 0.3
**Acceptance:** After KYC approval, ONCHAINID deployed, claims issued with expiry, wallet registered in IdentityRegistry. Verified via on-chain view calls.

### 2.4 Web3 Compliance Service — On-Chain Enforcement
**What:** Replace all 3 TODO stubs in compliance_action_service with real contract calls: `setAddressFrozen()`, `forcedTransfer()`, `recoveryAddress()`, `pause()`/`unpause()`.
**Where:** `apps/api/services/compliance_action_service.py`
**Depends on:** 0.3
**Acceptance:** Freeze/unfreeze/forced-transfer/recovery/pause all execute on-chain AND write audit log. Verified via on-chain state check after each action.

### 2.5 Web3 Vault Service — Claim Orchestration
**What:** Backend service for vault interactions: `getClaimable()` view calls, claim tx building, fraction burn verification.
**Where:** `apps/api/services/web3_vault_service.py` — new file
**Depends on:** 1.2, 0.3
**Acceptance:** `GET /portfolio/vesting/{id}/claimable` returns real on-chain claimable amount. Claim endpoint builds and tracks vault claim transaction.

### 2.6 Transaction Receipt Handler
**What:** Generic service for submitting transactions, waiting for receipts, handling failures, and storing tx hashes.
**Where:** `apps/api/services/web3_tx_service.py` — new file
**Depends on:** 0.3
**Acceptance:** All web3 services use this for tx submission. Retries on nonce issues. Logs all tx hashes to audit_logs.

---

## Sprint 3 — Frontend Web3 Integration (Week 4-5)

Connect the frontend to actual on-chain transactions.

### 3.1 Investment Flow — On-Chain Contribute
**What:** After USDC approval, call `Sale.contribute()` on-chain via wagmi `useWriteContract`. Wait for receipt, then record in backend.
**Where:** `apps/launchpad/src/app/invest/[slug]/page.tsx`, `apps/launchpad/src/components/organisms/InvestFlow.tsx`
**Depends on:** 2.2
**Acceptance:** Full flow: amount → review (with compliance acknowledgment checkbox) → approve USDC → contribute on-chain → success with real tx hash linked to BaseScan.

### 3.2 Compliance Acknowledgment Checkbox
**What:** Add "I understand this is a regulated security" disclosure + checkbox to Step 2 of invest flow. Block proceed until checked.
**Where:** `apps/launchpad/src/components/organisms/InvestFlow.tsx`
**Acceptance:** Checkbox present, cannot proceed without checking. Acknowledgment timestamp stored in contribution record.

### 3.3 Vault Claim Flow
**What:** For vested sales, show fraction token balance, vesting progress, claimable amount. "Claim" button calls `CiretaVault.claim()` on-chain.
**Where:**
- `apps/launchpad/src/app/portfolio/claim/[token]/page.tsx` — update
- `apps/launchpad/src/lib/api/repositories/portfolio.repository.ts` — add vault endpoints
**Depends on:** 2.5
**Acceptance:** User sees fraction balance, vesting timeline with cliff indicator, claimable amount. Claim burns fractions and shows project token in wallet.

### 3.4 Direct Sale — Immediate Token Receipt
**What:** For non-vested sales, `contribute()` immediately shows project token in portfolio after on-chain confirmation.
**Where:** Same as 3.1
**Depends on:** 2.2
**Acceptance:** After contributing to a Direct-mode sale, project token balance appears in portfolio within 1 block confirmation.

### 3.5 Project Detail Tabs
**What:** Implement remaining tabs on project detail page: Financials, Documents, Team/Issuer, Token Details, Sale Phases.
**Where:** `apps/launchpad/src/app/project/[slug]/page.tsx`
**Acceptance:** All 6 tabs render with real data from API. Documents tab shows IPFS-linked files.

### 3.6 Transaction History Page
**What:** Dedicated `/portfolio/transactions` page with filterable table (investments, claims, refunds).
**Where:** `apps/launchpad/src/app/portfolio/transactions/page.tsx` — new page (currently redirects)
**Acceptance:** Shows all user transactions with tx hash links to BaseScan, filterable by type/date/token.

### 3.7 Phase Timeline Visualization
**What:** Visual timeline on project detail showing Seed → Private → Retail phases with dates, pricing, and current phase indicator.
**Where:** `apps/launchpad/src/components/molecules/PhaseTimeline.tsx` — new component
**Acceptance:** Renders phases as horizontal timeline. Current phase highlighted. Past phases show sold stats.

---

## Sprint 4 — Security & Compliance (Week 5-6)

### 4.1 MFA / Two-Factor Authentication
**What:** TOTP-based 2FA (Google Authenticator / Authy). Required for admin/issuer roles, optional for investors. Step-up auth for high-value transactions.
**Where:**
- `apps/api/models/user.py` — add `mfa_secret` (EncryptedString), `mfa_enabled` boolean
- `apps/api/services/mfa_service.py` — new: setup, verify, backup codes
- `apps/api/api/v1/endpoints/auth.py` — add `/auth/mfa/setup`, `/auth/mfa/verify`
- `apps/launchpad/src/app/settings/security/page.tsx` — MFA setup UI
- `apps/admin/src/app/` — enforce MFA on all admin routes
- `infra/alembic/` — migration
**Acceptance:** Admin/issuer cannot access protected routes without MFA. Investor can optionally enable. TOTP codes validate correctly.

### 4.2 Wallet Screening Service
**What:** Integrate wallet screening provider (Chainalysis KYT or Elliptic Lens) to screen wallets on link, before contribution, and periodic re-screening.
**Where:**
- `apps/api/services/wallet_screening_service.py` — new: `screen_address()`, `get_risk_score()`, `check_sanctions()`
- `apps/api/services/wallet_service.py` — call screening on `link_wallet()`
- `apps/api/services/sale_contribute_service.py` — call screening before contribution
- `apps/api/workers/tasks.py` — add `task_periodic_wallet_rescreen()`
- `packages/common/config/defaults.py` — add screening thresholds
- `.env.backend.example` — add `WALLET_SCREENING_API_KEY`, `WALLET_SCREENING_PROVIDER`
**Acceptance:**
- Wallet link blocked if sanctions hit
- Contribution blocked if risk score above threshold
- High-risk wallets flagged in admin compliance dashboard
- Periodic re-screen runs daily on all linked wallets

### 4.3 Webhook Retry + Dead Letter Queue
**What:** Wrap Sumsub webhook processing in a retry mechanism. Failed webhooks stored in a dead letter table for manual replay.
**Where:**
- `apps/api/models/webhook_event.py` — new model: `event_id`, `provider`, `payload`, `status` (pending/processed/failed), `attempts`, `last_error`
- `apps/api/api/v1/endpoints/kyc.py` — store raw webhook, process async
- `apps/api/workers/tasks.py` — `task_process_webhook()` with 3 retries + exponential backoff
- `apps/api/api/v1/endpoints/admin_operations.py` — add `POST /admin/webhooks/{id}/replay`
- `infra/alembic/` — migration
**Acceptance:** Webhook failure doesn't lose KYC update. Failed events visible in admin. Replay button re-processes.

### 4.4 Contribution Idempotency
**What:** Add idempotency key to contribution endpoint. Dedup by `tx_hash` before processing.
**Where:**
- `apps/api/services/sale_contribute_service.py` — check `tx_hash` uniqueness before creating contribution
- `apps/api/api/v1/endpoints/sales.py` — accept `Idempotency-Key` header
**Acceptance:** Same `tx_hash` or idempotency key submitted twice returns existing contribution, not a duplicate.

### 4.5 KYC Expiry Monitoring
**What:** Background task checks `kyc_expires_at` on all users. Sends re-verification reminder 30 days before expiry. Blocks investment if expired.
**Where:**
- `apps/api/workers/tasks.py` — `task_check_kyc_expiry()` (daily cron)
- `apps/api/services/kyc_service.py` — set `kyc_expires_at` on approval (e.g., +1 year)
- `apps/api/services/sale_contribute_service.py` — check expiry before allowing contribution
- `apps/api/core/sumsub_crypto.py` — extract expiry from webhook payload
**Acceptance:** Expired KYC blocks investment. Reminder email sent 30 days before expiry.

---

## Sprint 5 — Missing API Endpoints & Backend Features (Week 6-7)

### 5.1 Missing CRUD Endpoints
**What:** Implement all spec endpoints not yet built.
**Where:** `apps/api/api/v1/endpoints/`

| Endpoint | File | Notes |
|---|---|---|
| `PATCH /users/me` | `auth.py` | Profile update |
| `PATCH /tokens/{id}` | `tokens.py` | Token metadata update |
| `POST /sales/{id}/deploy` | `sales.py` | Deploy sale contract on-chain |
| `POST /sales/{id}/phases` | `sales.py` | Add phase to existing sale |
| `PATCH /sales/{id}/phases/{phaseId}` | `sales.py` | Update individual phase |
| `GET /sales/{id}/contributions` | `sales.py` | Issuer-facing contributions list |
| `POST /sales/{id}/otc-allocate` | `sales.py` | OTC allocation |
| `GET /portfolio/transactions` | `portfolio.py` | Transaction history |
| `GET /portfolio/dividends` | `portfolio.py` | Claimable dividends |
| `GET /redemptions/{id}` | `portfolio.py` | Single redemption detail |
| `PATCH /redemptions/{id}/approve` | `admin_compliance.py` | Approve redemption (burn tokens) |
| `PATCH /redemptions/{id}/reject` | `admin_compliance.py` | Reject with reason |
| `POST /admin/compliance/trusted-issuers` | `admin_compliance.py` | Manage TrustedIssuersRegistry |
| `GET /admin/system/health` | `admin_operations.py` | Contract + indexer health |
| `GET /admin/analytics` | `admin_operations.py` | Real stats (replace stub) |

**Acceptance:** All endpoints return correct data, have proper auth, and pass integration tests.

### 5.2 Dividend Service
**What:** Backend service for DividendDistributor contract. Deposit dividends, query claimable, claim.
**Where:**
- `apps/api/services/dividend_service.py` — new
- `apps/api/api/v1/endpoints/portfolio.py` — add dividend endpoints
- `apps/api/api/v1/endpoints/admin_operations.py` — add issuer deposit endpoint
**Depends on:** 0.3 (ABI loader)
**Acceptance:** Issuer deposits USDC on-chain, investor sees claimable amount, investor claims via API + on-chain tx.

### 5.3 OTC Allocation Service
**What:** Backend + admin UI for OTC token allocation. Calls `Sale.issuerAllocate()` on-chain.
**Where:**
- `apps/api/services/sale_contribute_service.py` — add `otc_allocate()` method
- `apps/api/api/v1/endpoints/sales.py` — add `POST /sales/{id}/otc-allocate`
- `apps/admin/src/app/issuer/sales/[id]/otc/page.tsx` — real UI (currently stub)
**Depends on:** 2.2
**Acceptance:** Admin allocates tokens to investor wallet. Contribution marked `is_otc=true`. Excluded from fee calculation.

### 5.4 Accredited Investor Verification
**What:** Level 3 KYC tier for accredited investors. Income/net worth docs via Sumsub `accredited-investor` level. Issue `CLAIM_TOPIC_ACCREDITED_INVESTOR` on-chain. Sale phases can require specific tier.
**Where:**
- `apps/api/services/kyc_service.py` — add `initiate_accredited()`, handle accredited webhook
- `apps/api/models/sale_phase.py` — add `required_kyc_level` field
- `apps/api/services/sale_contribute_service.py` — check phase-level KYC requirement
- `apps/launchpad/src/app/verify/` — add accredited investor tab
- `infra/alembic/` — migration
**Acceptance:** Accredited verification flow works. Private rounds blocked for non-accredited investors. On-chain claim issued.

---

## Sprint 6 — Admin Portal Completion (Week 7-8)

### 6.1 Global Compliance Management UI
**What:** Admin UI to manage TrustedIssuersRegistry (add/remove claim issuers) and ClaimTopicsRegistry (add/remove required claim topics).
**Where:**
- `apps/admin/src/app/platform/compliance/page.tsx` — extend
- `apps/api/api/v1/endpoints/admin_compliance.py` — add trusted issuer + claim topic endpoints
**Acceptance:** Platform admin can add/remove trusted issuers and claim topics from UI. Changes reflected on-chain.

### 6.2 System Health Dashboard
**What:** Admin page showing contract deployment status, gas costs, indexer status, RPC health, Redis/DB connectivity.
**Where:**
- `apps/admin/src/app/platform/health/page.tsx` — new page
- `apps/api/api/v1/endpoints/admin_operations.py` — `GET /admin/system/health`
**Acceptance:** Dashboard shows green/red status for each subsystem. Auto-refreshes every 30s.

### 6.3 Issuer Fee Reports
**What:** Page showing platform fees paid per issuer, revenue breakdown, fee history.
**Where:**
- `apps/admin/src/app/issuer/reports/page.tsx` — real implementation (currently stub)
- `apps/api/api/v1/endpoints/admin_operations.py` — fee report endpoint
**Acceptance:** Issuer sees total fees paid, per-sale breakdown, exportable to CSV.

### 6.4 Platform Analytics (Real Data)
**What:** Replace stub analytics page with real metrics: TVL, user growth, transaction volume, KYC funnel, fee revenue.
**Where:**
- `apps/admin/src/app/platform/analytics/page.tsx` — real implementation
- `apps/api/api/v1/endpoints/admin_operations.py` — analytics endpoints with aggregation queries
**Acceptance:** Charts render with real data. Recharts used per spec. Date range filter works.

### 6.5 Compliance Module Configuration UI
**What:** Per-token admin UI to add/remove compliance modules (CountryAllowModule, MaxOwnershipModule, etc.) and configure their parameters.
**Where:**
- `apps/admin/src/app/issuer/tokens/[id]/compliance/page.tsx` — new page
- `apps/api/services/compliance_module_service.py` — new: add/remove/configure modules on-chain
**Depends on:** 2.4
**Acceptance:** Issuer can add CountryAllowModule to a token, set allowed countries, and verify on-chain that the module is bound.

### 6.6 Whitelist Management UI
**What:** Per-phase whitelist management. Add/remove addresses, bulk upload CSV.
**Where:**
- `apps/admin/src/app/issuer/sales/[id]/whitelist/page.tsx` — new page
- `apps/api/api/v1/endpoints/sales.py` — add whitelist CRUD endpoints
**Acceptance:** Issuer can add addresses to phase whitelist. Addresses checked on-chain during contribute.

---

## Sprint 7 — Event Indexing & Chain Sync (Week 8-9)

### 7.1 The Graph Subgraph — Connect to App
**What:** Deploy existing subgraph, wire frontend to query it via GraphQL for real-time chain data (balances, transfers, sale progress).
**Where:**
- `subgraph/` — review and deploy existing subgraph code
- `apps/launchpad/src/lib/api/subgraph.ts` — new: GraphQL client
- `apps/launchpad/src/lib/hooks/useSubgraph.ts` — new: TanStack Query hooks for subgraph data
**Acceptance:** Portfolio shows on-chain `balanceOf()` data from subgraph. Sale progress updates within 15 seconds of on-chain change.

### 7.2 Event Listener / Blockchain Poller
**What:** Backend service that polls or listens for on-chain events (Transfer, Freeze, Compliance, SaleFinalized, TokensClaimed) and syncs DB state.
**Where:**
- `apps/api/services/event_listener_service.py` — new
- `apps/api/workers/tasks.py` — `task_sync_chain_events()` (runs every block or every 12s)
**Acceptance:** On-chain state changes reflected in DB within 30 seconds. DB and chain never diverge for tracked events.

### 7.3 Balance Reconciliation
**What:** Periodic task that compares DB portfolio balances with on-chain `balanceOf()` and flags discrepancies.
**Where:**
- `apps/api/workers/tasks.py` — `task_reconcile_balances()` (daily)
- `apps/api/models/` — add `balance_discrepancy` log table
**Acceptance:** Daily report of any DB/chain balance mismatches. Alert sent to admin if discrepancy found.

---

## Sprint 8 — Safe / Multisig Support (Week 9-10)

### 8.1 Safe Wallet Detection
**What:** On wallet connection, check if address is a contract (Safe). Adapt UX accordingly.
**Where:**
- `apps/launchpad/src/contexts/Web3Context.tsx` — add `isSafe` detection via `getBytecode()`
- `apps/launchpad/src/components/` — conditional UI: "Propose Transaction" vs "Confirm Transaction"
**Acceptance:** Safe wallets detected. UI shows "Propose Transaction" button instead of "Confirm".

### 8.2 Safe Protocol Kit Integration
**What:** Install Safe Protocol Kit + API Kit. Build propose/sign/execute flow for all on-chain transactions.
**Where:**
- `apps/launchpad/package.json` — add `@safe-global/protocol-kit`, `@safe-global/api-kit`
- `apps/launchpad/src/lib/safe/` — new: `proposeTx()`, `getSignatureStatus()`, `executeTx()`
- `apps/launchpad/src/components/organisms/SafeTxTracker.tsx` — pending signature display
**Depends on:** 8.1
**Acceptance:** Safe wallet can propose contribution tx. Shows "Awaiting 2/3 signatures". Tx executes when threshold met.

### 8.3 Safe Identity Registration
**What:** Register Safe address in IdentityRegistry with same ONCHAINID as the controlling wallet.
**Where:** `apps/api/services/web3_identity_service.py`
**Acceptance:** Safe address is KYC-verified on-chain and can receive/transfer ERC-3643 tokens.

---

## Sprint 9 — Infrastructure & DevOps (Week 10-11)

### 9.1 CI/CD Pipeline
**What:** GitHub Actions workflows for lint, test, build, deploy.
**Where:** `.github/workflows/`
- `ci.yml` — PR checks: ruff, tsc, pytest, vitest, hardhat test
- `deploy-staging.yml` — deploy to staging on merge to `develop`
- `deploy-production.yml` — deploy to production on merge to `main`
**Acceptance:** PRs blocked if any check fails. Staging auto-deploys on merge.

### 9.2 Sentry Error Tracking
**What:** Integrate Sentry for frontend and backend error tracking.
**Where:**
- `apps/launchpad/` — add `@sentry/nextjs`, configure in `next.config.ts`
- `apps/admin/` — same
- `apps/api/main.py` — add `sentry-sdk[fastapi]` middleware
**Acceptance:** Errors surface in Sentry dashboard with stack traces, user context, and breadcrumbs.

### 9.3 Prometheus Metrics + Grafana
**What:** Expose `/metrics` endpoint from FastAPI. Deploy Grafana dashboards for API latency, DB connections, queue depth, RPC health.
**Where:**
- `apps/api/main.py` — add `prometheus-fastapi-instrumentator`
- `infra/grafana/` — dashboard JSON configs
**Acceptance:** Grafana shows real-time API latency, error rate, and dependency health.

### 9.4 Database Backup Strategy
**What:** Automated daily PostgreSQL backups with 30-day retention. Document restore procedure.
**Where:** Railway/cloud provider config + `scripts/backup-db.sh`
**Acceptance:** Backup runs daily. Restore tested and documented. Backup alert on failure.

### 9.5 HSM/KMS for Deployer Key
**What:** Move deployer private key from file (`~/.ferron/x402-server-wallet.json`) to AWS KMS or equivalent. Sign transactions via KMS API.
**Where:**
- `apps/api/services/web3_tx_service.py` — KMS signing integration
- `packages/common/core/config.py` — add KMS key ID setting
**Acceptance:** No private key on disk in production. All contract deployments and admin txs signed via KMS.

### 9.6 Web3 RPC Circuit Breaker
**What:** Circuit breaker pattern on RPC calls. After N failures, open circuit and return graceful error. Fallback RPC URL support.
**Where:**
- `apps/api/core/web3_provider.py` — new: circuit breaker + fallback RPC
- `packages/common/config/defaults.py` — add `WEB3_FALLBACK_RPC_URL`
**Acceptance:** RPC outage returns "Service temporarily unavailable" instead of cascading 500 errors. Fallback RPC used when primary down.

---

## Sprint 10 — Frontend Polish & Missing Pages (Week 11-12)

### 10.1 Dividend Claim UI
**What:** `/portfolio/dividends` page with claimable amounts per token, claim button, distribution history.
**Where:** `apps/launchpad/src/app/portfolio/dividends/page.tsx` — real page (currently redirects)
**Depends on:** 5.2
**Acceptance:** Shows claimable dividends. Claim calls DividendDistributor on-chain.

### 10.2 OTC Allocation Admin UI
**What:** `/issuer/sales/[id]/otc` page with form to allocate tokens to investor wallet + history table.
**Where:** `apps/admin/src/app/issuer/sales/[id]/otc/page.tsx` — real page (currently stub)
**Depends on:** 5.3
**Acceptance:** Issuer enters wallet + amount, allocation recorded on-chain and in DB.

### 10.3 Settings Pages
**What:** Implement real settings pages: profile, verification status, notifications preferences.
**Where:**
- `apps/launchpad/src/app/settings/profile/page.tsx`
- `apps/launchpad/src/app/settings/verification/page.tsx`
- `apps/launchpad/src/app/settings/notifications/page.tsx`
**Acceptance:** Users can update profile, view KYC tier, configure email notification preferences.

### 10.4 Google OAuth
**What:** Complete Google OAuth flow (button exists, no callback handler).
**Where:**
- `apps/api/api/v1/endpoints/auth.py` — add `/auth/google/callback`
- `apps/api/services/auth_service.py` — add `login_with_google()`
- `apps/launchpad/src/app/login/page.tsx` — wire button to OAuth redirect
**Acceptance:** "Continue with Google" creates account and logs in. Existing users link Google to existing account.

### 10.5 CSV Export
**What:** Export portfolio holdings, transaction history, and investor list as CSV.
**Where:**
- `apps/api/api/v1/endpoints/portfolio.py` — add `GET /portfolio/export?format=csv`
- `apps/api/api/v1/endpoints/admin_investors.py` — add `GET /admin/investors/export`
- `apps/launchpad/src/app/account/page.tsx` — wire export button
**Acceptance:** CSV downloads with correct data. Date range filter supported.

---

## Sprint 11 — Timelock & Governance (Week 12-13)

### 11.1 Timelock Contract for Admin Operations
**What:** Deploy OpenZeppelin TimelockController. Route compliance module changes and trusted issuer updates through timelock (e.g., 24-hour delay).
**Where:**
- `contracts/src/platform/CiretaTimelock.sol` — new (or use OZ directly)
- Update CiretaTokenFactory and registries to require timelock as admin
**Acceptance:** Adding a compliance module requires proposal → 24h wait → execution. Emergency pause bypasses timelock.

### 11.2 Multisig for Platform Admin
**What:** Deploy Safe multisig for platform admin operations. Platform contracts owned by multisig, not single EOA.
**Where:** Deployment config + documentation
**Acceptance:** All platform-level contract admin operations require 2/3 multisig signatures.

---

## Non-Sprint: Ongoing / Cross-Cutting

### N.1 Test Coverage
**What:** Maintain test coverage as features are built.
- Smart contracts: Hardhat tests for every new contract + updated Sale tests
- Backend: pytest for every new service method + endpoint
- Frontend: Vitest for critical components (InvestFlow, VaultClaim, SafeTxTracker)
**Target:** 80%+ line coverage on backend services. 100% of contract paths tested.

### N.2 Audit Protocol (Per Sprint)
**What:** Run the CLAUDE.md audit protocol after every sprint before proceeding:
```bash
ruff check .
python -c "from apps.api.main import app"
poetry run pytest tests/ -x -q
cd apps/launchpad && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
npx hardhat test  # in contracts/
```

### N.3 BUILD_LOG.md Updates
**What:** After every sprint, append results to `docs/BUILD_LOG.md` per CLAUDE.md protocol.

---

## Dependency Graph

```
Sprint 0 (Bugs + Foundation)
    │
    ├── Sprint 1 (Contracts V2)
    │       │
    │       └── Sprint 2 (Web3 Bridge)
    │               │
    │               ├── Sprint 3 (Frontend Web3)
    │               │
    │               ├── Sprint 5 (Missing Endpoints)
    │               │       │
    │               │       └── Sprint 6 (Admin Portal)
    │               │
    │               └── Sprint 7 (Event Indexing)
    │
    ├── Sprint 4 (Security) ← can run in parallel with Sprint 1-2
    │
    ├── Sprint 8 (Safe/Multisig) ← after Sprint 3
    │
    ├── Sprint 9 (Infrastructure) ← can run in parallel from Sprint 2 onward
    │
    ├── Sprint 10 (Frontend Polish) ← after Sprints 3, 5, 6
    │
    └── Sprint 11 (Governance) ← after Sprint 9
```

**Critical path:** Sprint 0 → 1 → 2 → 3 (Web3 end-to-end working)
**Parallelizable:** Sprint 4 (Security) and Sprint 9 (Infra) can run alongside the critical path.

---

## Items Explicitly Deferred (Phase 3+)

These are NOT in this plan. They are Phase 3/4 per the product specification:

| Feature | Reason for Deferral |
|---|---|
| P2P Order Board | Phase 3 — requires ATS legal analysis |
| ATS Partnership (tZERO/Securitize) | Phase 3 — partnership negotiation |
| Fiat On-Ramp (MoonPay/Transak) | Phase 3 — integration + additional KYC |
| Cross-Chain Deployment | Phase 3 — after Base mainnet proven |
| Compliant DEX (Uniswap V4 hooks) | Phase 4 — R&D |
| DeFi Integrations (lending/buyback) | Phase 4 — R&D |
| Third-Party Public API | Phase 4 — after internal APIs stable |
| White-Label / Per-Issuer Subdomain | Phase 4 — scale feature |
| Investor Communication System | Phase 3+ — not in spec |

---

## Summary: Total New Files

| Layer | New Files | Modified Files |
|---|---|---|
| **Contracts** | `CiretaFractionToken.sol`, `CiretaVault.sol`, `CiretaFractionFactory.sol`, `CiretaTimelock.sol` | `Sale.sol`, `CiretaSaleFactory.sol`, `deploy.ts` |
| **Backend Services** | `web3_sale_service.py`, `web3_vault_service.py`, `web3_tx_service.py`, `wallet_screening_service.py`, `mfa_service.py`, `dividend_service.py`, `event_listener_service.py`, `compliance_module_service.py`, `web3_provider.py` (circuit breaker), `contract_registry.py` | `web3_token_service.py`, `web3_identity_service.py`, `compliance_action_service.py`, `sale_contribute_service.py`, `auth_service.py`, `kyc_service.py`, `wallet_service.py` |
| **Backend Models** | `webhook_event.py` | `token.py`, `token_sale.py`, `contribution.py`, `vesting_schedule.py`, `redemption_request.py`, `user.py` |
| **Backend Endpoints** | Multiple new endpoints across existing router files | `sales.py`, `portfolio.py`, `admin_compliance.py`, `admin_operations.py`, `auth.py` |
| **Frontend Pages** | `transactions/page.tsx`, `dividends/page.tsx` (real), settings pages, compliance config page, whitelist page, health page | `invest/[slug]/page.tsx`, `portfolio/claim/[token]/page.tsx`, `project/[slug]/page.tsx`, `issuer/sales/[id]/otc/page.tsx` |
| **Infrastructure** | `.github/workflows/`, Sentry config, Grafana dashboards, backup scripts | `main.py` (Sentry), `next.config.ts` (Sentry) |
| **Migrations** | 3-4 Alembic migrations | — |
