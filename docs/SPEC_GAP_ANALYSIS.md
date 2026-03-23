# Spec vs Implementation Gap Analysis

> **Date:** 2026-03-23
> **Compared:** `cireta-launchpad/docs/cireta-product-specification.md` (v1.0, March 2026) vs actual Cireta codebase
> **Legend:** SPEC = in product specification | IMPL = in codebase | NEW = discovered in critical analysis, not in spec

---

## Summary

| Category | Spec Items | Implemented | Gaps (from spec) | New Discoveries |
|---|---|---|---|---|
| Phase 1 — Core | 9 features | 7 complete, 2 partial | 4 gaps | 3 new |
| Phase 2 — Multi-Issuer | 10 features | 6 complete, 2 partial, 2 missing | 7 gaps | 4 new |
| Phase 3 — Secondary | 7 features | 0 complete | 7 gaps (expected) | 2 new |
| Phase 4 — Scale | 5 features | 0 complete | 5 gaps (expected) | 0 |
| Infrastructure | 8 items | 3 complete, 5 missing | 5 gaps | 5 new |
| Security | 12 items | 6 complete, 6 missing | 6 gaps | 4 new |

---

## Phase 1 — Core Platform (MVP)

### 1.1 User Authentication
**SPEC:** Email + password, JWT access/refresh, email verification, password reset, session management via Redis
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Email + password registration | IMPL | Working |
| JWT access + refresh tokens | IMPL | 15min access, 7d refresh |
| Email verification flow | IMPL | Via Resend transactional email |
| Password reset flow | IMPL | Signed token flow |
| Session management via Redis | GAP | **Redis token blacklist not implemented** (`auth_service.py:135` has TODO). Revoked JWTs valid until expiry. |

### 1.2 KYC Integration
**SPEC:** Sumsub WebSDK, access token generation, Level 1 KYC, webhook processing, ONCHAINID deploy + claims, Identity Registry registration
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Sumsub WebSDK embedded | IMPL | `@sumsub/websdk-react` dynamic import |
| Backend generates access tokens | IMPL | Working, dev mode returns mocks |
| Level 1 Basic KYC | IMPL | ID + liveness via Sumsub |
| Webhook `applicantReviewed` processing | IMPL | HMAC-SHA256 validated first |
| Deploy ONCHAINID on approval | PARTIAL | `web3_identity_service.py` — CREATE2 computation is placeholder |
| Issue claims (KYC, country) | PARTIAL | Method exists but relies on incomplete Web3 service |
| Register wallet in Identity Registry | PARTIAL | `register_identity()` implementation incomplete |

### 1.3 Wallet Connection
**SPEC:** RainbowKit, network detection + auto-switch, wallet linked to backend, multiple wallets per user
**STATUS:** Complete

| Item | Status | Notes |
|---|---|---|
| RainbowKit modal | IMPL | MetaMask, WalletConnect, Coinbase Wallet |
| Network detection + auto-switch | IMPL | Checks `chainId === BASE_CHAIN_ID (8453)` |
| Wallet linked to user account | IMPL | SIWE signature verification on link |
| Multiple wallets per user | IMPL | With `is_primary` flag |

### 1.4 Token Creation
**SPEC:** Platform admin creates tokens via TokenFactory, guided form, deploy ERC-3643 set, metadata stored in backend + IPFS
**STATUS:** Partial

| Item | Status | Notes |
|---|---|---|
| Guided form (4-step wizard) | IMPL | Admin portal `/issuer/tokens/new` |
| Deploy ERC-3643 token set | GAP | **`web3_token_service.py:36` returns fake address `0x000...000`** |
| Token metadata in backend | IMPL | SQLAlchemy model with all fields |
| IPFS document upload | PARTIAL | `token_documents` model exists, Pinata integration unclear |

### 1.5 Single-Phase Token Sale
**SPEC:** Price/allocation/min-max/dates, soft/hard cap, USDC payment, lifecycle, escrow, refund
**STATUS:** Complete (backend), Partial (Web3)

| Item | Status | Notes |
|---|---|---|
| Sale configuration | IMPL | Multi-phase support (exceeds Phase 1 spec) |
| Soft/hard cap | IMPL | Both contract + backend |
| USDC payment | IMPL | Frontend approves USDC |
| Contributions held in escrow | GAP | **Frontend never calls `Sale.contribute()` on-chain** — USDC approval only |
| Refund mechanism | IMPL | `claim_refund()` in service, `claimRefund()` in contract |

### 1.6 Launchpad UI
**SPEC:** Home page, project cards, filters, search, project detail, tabs, sidebar CTA
**STATUS:** Complete

| Item | Status | Notes |
|---|---|---|
| Home page (hero, cards, stats) | IMPL | Framer-motion animations, react-countup |
| Project cards with progress bar | IMPL | Exact Cireta brand pattern |
| Filters (asset class, status) | IMPL | Working on `/explore` |
| Search by name/issuer | IMPL | Search input on explore page |
| Project detail with tabs | IMPL | Overview tab, investment sidebar |
| Tabs: Financials, Documents, Team | GAP | **Only Overview tab implemented**, spec calls for 6 tabs |

### 1.7 Investment Flow
**SPEC:** 5-step flow: amount → review → approve USDC → confirm investment → success
**STATUS:** Partial

| Item | Status | Notes |
|---|---|---|
| Step 1: Amount input + validation | IMPL | Min/max, balance check |
| Step 2: Review + compliance acknowledgment | GAP | **No compliance acknowledgment checkbox** ("I understand this is a regulated security") |
| Step 3: Approve USDC spend | IMPL | `writeApprove()` via wagmi |
| Step 4: Confirm investment (on-chain) | GAP | **No `sale.contribute()` contract call** — API call only |
| Step 5: Success with tx hash | IMPL | Success screen exists |

### 1.8 Portfolio Dashboard
**SPEC:** Total value, holdings cards, transaction history (filterable), claim flow
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Total portfolio value | IMPL | Aggregated from DB |
| Holdings cards with claim button | IMPL | Working |
| Transaction history (filterable) | GAP | **`/portfolio/transactions` redirects to `/portfolio`** — no dedicated TX history |
| Claim flow for finalized sales | IMPL | Via API, but **not on-chain** |

### 1.9 Platform Administration (Basic)
**SPEC:** Single issuer for MVP, token deploy, sale creation, investor list, fee config
**STATUS:** Complete (exceeds MVP — multi-issuer already built)

---

## Phase 2 — Multi-Issuer & Advanced

### 2.1 Multi-Issuer Admin Portal
**SPEC:** Platform admin panel + per-issuer dashboard

| Item | Status | Notes |
|---|---|---|
| Whitelist/revoke issuers | IMPL | Working |
| Per-issuer fee rates | IMPL | Basis points, 0–10000 |
| View all tokens/sales/investors | IMPL | Admin pages built |
| Global compliance management | GAP | **No UI to manage TrustedIssuersRegistry or ClaimTopicsRegistry** |
| System health (contracts, indexer) | GAP | **No system health dashboard** — spec calls for contract deployment status + gas costs + indexer status |
| Issuer dashboard overview | IMPL | Stats cards, active sales |
| Issuer token management | IMPL | Create + list tokens |
| Issuer sale management | IMPL | Create + monitor sales |
| Issuer investor management | IMPL | Table with KYC badges |
| Issuer compliance (freeze/recover) | IMPL | UI exists, **but actions are DB-only** |
| Fee reports | GAP | **No issuer fee report page** — spec calls for platform fees paid + issuer revenue breakdown |

### 2.2 Issuer Whitelisting & Fees
**SPEC:** Per-issuer fee rates, per-sale fee cap, fee collection at finalization only, OTC excluded
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Per-issuer fee rates (bps) | IMPL | In both contract + backend |
| Per-sale fee cap (absolute USDC max) | GAP | **`fee_cap_usdc` not in Sale model or contract** — spec calls for `feeCapUSDC` field |
| Fee collected at finalization only | IMPL | In Sale.sol `finalizeSale()` |
| OTC excluded from fee calculation | IMPL | `isOtc` tracked separately |

### 2.3 Multi-Phase Sales
**SPEC:** Multiple phases, per-phase config, optional whitelist, visual timeline, phase-specific pricing
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Multiple phases per sale | IMPL | Working in contract + backend |
| Per-phase configuration | IMPL | Price, allocation, min/max, dates |
| Optional per-phase whitelist | PARTIAL | **`whitelist_only` flag exists but `wallet_address` undefined in validation** (`sale_contribute_service.py:108` — runtime NameError) |
| Visual phase timeline | GAP | **No phase timeline visualization on project detail page** |

### 2.4 OTC Allocation
**SPEC:** Issuer allocates tokens for off-platform fiat, tracked separately, issuer-only
**STATUS:** Partial

| Item | Status | Notes |
|---|---|---|
| `issuerAllocate()` in contract | IMPL | In Sale.sol |
| Admin UI for OTC allocation | GAP | **`/issuer/sales/[id]/otc` page exists but is a stub** |
| Tracked separately in dashboard | PARTIAL | `is_otc` field exists on contributions |

### 2.5 Vesting Vault
**SPEC:** Cliff, linear vesting, claim, revoke, portfolio UI, auto-created by sale
**STATUS:** Complete (backend + contract), Partial (frontend)

| Item | Status | Notes |
|---|---|---|
| Configurable cliff + linear vesting | IMPL | Contract + backend service |
| Investor `claim()` | IMPL | Service method, **but no on-chain `vestingVault.claim()` tx** |
| Revoke unvested tokens | IMPL | In contract |
| Portfolio vesting timeline UI | PARTIAL | Shows schedules, **no visual timeline with cliff indicator** per spec |
| Auto-created by Sale on finalization | GAP | **Not wired** — spec says Sale creates VestingSchedule automatically |

### 2.6 Commodity Redemption
**SPEC:** Request → approve (burn tokens) → fulfill, Chainlink PoR verification, portfolio UI
**STATUS:** Complete (backend), Partial (contract integration)

| Item | Status | Notes |
|---|---|---|
| Request redemption (amount + delivery) | IMPL | Backend service + frontend form |
| Issuer approve/reject | IMPL | `update_fulfillment()` in service |
| Tokens burned on approval | GAP | **Backend never calls `redemptionManager.approveRedemption()` on-chain** |
| Chainlink PoR verification | GAP | **Returns mock data**, no real Chainlink feed configured |
| Portfolio redemption status tracker | IMPL | Pending/Processing/Fulfilled display |

### 2.7 Dividend Distribution
**SPEC:** Issuer deposits USDC, proportional distribution, pull-based claim, portfolio display
**STATUS:** Contract exists, no API/UI

| Item | Status | Notes |
|---|---|---|
| `DividendDistributor.sol` contract | IMPL | Epoch model, pull-based |
| Backend dividend service | GAP | **No DividendService** |
| `/portfolio/dividends` API endpoint | GAP | **Spec calls for `GET /portfolio/dividends`** — not implemented |
| Admin "Deposit Dividend" UI | GAP | **No UI** |
| Portfolio "Claim Dividends" button | GAP | **`/portfolio/dividends` redirects to `/portfolio`** |

### 2.8 Enhanced KYC Tiers
**SPEC:** Level 2 (Enhanced), Level 3 (Accredited), Level 4 (KYB Corporate), different Sumsub levels, on-chain claims updated, sale phases require specific tiers
**STATUS:** Partial

| Item | Status | Notes |
|---|---|---|
| Level 2 Enhanced KYC (proof of address) | GAP | **Only basic KYC (Level 1 equivalent) → jumps straight to kyc_level=2** |
| Level 3 Accredited Investor | GAP | **No accreditation verification flow** — `CLAIM_TOPIC_ACCREDITED_INVESTOR=3` defined in contract but never issued |
| Level 4 KYB Corporate | IMPL | `initiate_corporate()` with business-kyb-level |
| Sale phases require specific tiers | GAP | **No phase-level KYC tier requirement** — only global `kyc_level >= 2` check |

### 2.9 Safe / Multisig Support
**SPEC:** Detect Safe wallet, adapted UX ("Propose Transaction"), pending signature display, poll Safe API, Safe registered in Identity Registry
**STATUS:** Not Implemented

| Item | Status | Notes |
|---|---|---|
| Safe wallet detection | GAP | **No bytecode check for contract wallets** |
| "Propose Transaction" UX | GAP | **Not implemented** |
| Pending signature count display | GAP | **Not implemented** |
| Safe Protocol Kit / API Kit | GAP | **Not in dependencies** |

**This is a Phase 2 spec requirement that is completely missing.**

### 2.10 Failed Sale Refunds
**SPEC:** Soft cap not met → FAILED, `claimRefund()`, time-locked, pull pattern, email notification
**STATUS:** Mostly Complete

| Item | Status | Notes |
|---|---|---|
| Sale FAILED on soft cap miss | IMPL | In `finalize_sale()` |
| `claimRefund()` (pull pattern) | IMPL | Backend service + contract |
| Time-locked refund period | GAP | **No time-lock between sale end and refund availability** |
| Email notification for refund | IMPL | `sale_finalized` template in task worker |

---

## Phase 3 — Secondary Trading (Expected: Not Built)

All Phase 3 features are **not implemented**, which is expected per the phased roadmap. Listed for completeness:

| Feature | Status | Notes |
|---|---|---|
| **3.1 P2P Order Board** | NOT IMPL | Spec: buy/sell orders, bilateral negotiation, pre-trade `canTransfer()` check, escrow. No `orders` model, service, or endpoint. |
| **3.2 ATS Partnership** | NOT IMPL | Spec: tZERO Connect or Securitize Markets integration |
| **3.3 Token Recovery** | PARTIAL | Contract has `recoveryAddress()`, backend service has `recover_tokens()` stub, **no investor-facing recovery request flow** per spec (support flow → identity verification → admin recovery queue) |
| **3.4 Advanced Compliance Modules** | PARTIAL | `ConditionalTransferModule` and `TimeTransfersLimitModule` contracts exist, **no admin UI to configure per-token** |
| **3.5 Cross-Chain Deployment** | NOT IMPL | Spec: deploy on additional L2 |
| **3.6 Fiat On-Ramp** | NOT IMPL | Spec: MoonPay/Transak integration |
| **3.7 Mobile Optimization** | PARTIAL | Responsive design exists, **no WalletConnect mobile flow testing noted** |

---

## Phase 4 — Scale & Advanced (Expected: Not Built)

| Feature | Status |
|---|---|
| 4.1 Compliant DEX (Uniswap V4 hooks) | NOT IMPL |
| 4.2 DeFi Integrations (lending, buyback) | NOT IMPL |
| 4.3 Advanced Analytics (TVL, demographics, tax) | NOT IMPL |
| 4.4 Third-Party API (public REST, API keys) | NOT IMPL |
| 4.5 White-Label (per-issuer subdomain) | NOT IMPL |

---

## Infrastructure Gaps (Spec vs Implementation)

| Spec Requirement | Status | Notes |
|---|---|---|
| **Turborepo + pnpm** monorepo | DIVERGED | Using plain monorepo, not Turborepo. pnpm not enforced. |
| **The Graph subgraph** | GAP | Subgraph directory exists but **not connected to app**. Spec lists as Phase 1. |
| **GitHub Actions CI/CD** | GAP | **No `.github/workflows/` directory found** — spec calls for lint, test, build, deploy pipeline |
| **Sentry** error tracking | GAP | **Not integrated** — no `@sentry/nextjs` or `sentry-sdk` in dependencies |
| **Prometheus + Grafana** metrics | GAP | **Not implemented** |
| **Celery** task queue | DIVERGED | Using **arq** (Redis-based) instead of Celery. Functionally equivalent. |
| **Structured logging (JSON)** | IMPL | Via `LoggingMiddleware` with correlation IDs |
| **Health check endpoint** | IMPL | `/api/v1/health/live` and `/api/v1/health/ready` |

---

## Security Gaps (Spec vs Implementation)

| Spec Requirement | Status | Notes |
|---|---|---|
| CSP headers | IMPL | Via `SecurityHeadersMiddleware` |
| JWT with rotation | IMPL | Access 15min, refresh 7d |
| Password hashing (bcrypt) | IMPL | Working |
| Webhook HMAC verification | IMPL | On Sumsub webhooks |
| Rate limiting (Redis-backed) | IMPL | Per-endpoint limits |
| CORS strict origins | IMPL | Configurable via env |
| **Multisig admin operations** | GAP | **Spec: "Platform admin operations via Safe multisig"** — not implemented |
| **Key management (HSM/KMS)** | GAP | **Deployer private key loaded from file**, not HSM/KMS |
| **On-chain event monitoring** | GAP | **No anomaly detection / event listener** |
| **Timelock for admin operations** | GAP | **Spec: "Timelock for admin operations (upgrade compliance modules, add/remove trusted issuers)"** — not implemented |
| **Database backups** | GAP | **No backup strategy documented or configured** |
| **Contract address registry backup** | GAP | **No off-chain backup of deployed addresses** |

---

## Data Model Gaps (Spec vs Implementation)

| Spec Field/Table | Status | Notes |
|---|---|---|
| `users.is_accredited` | GAP | **Spec has `BOOLEAN` field** — not in implementation |
| `issuers.metadata_ipfs` | GAP | **Spec stores issuer metadata on IPFS** — implementation uses `legal_entity_name` + `jurisdiction` only |
| `issuers.kyb_status` | DIVERGED | Implementation uses `status (pending|active|suspended)` — no separate KYB status |
| `tokens.identity_registry` | GAP | **Spec stores per-token IdentityRegistry address** — not in model |
| `tokens.compliance_address` | GAP | **Spec stores per-token ModularCompliance address** — not in model |
| `tokens.image_url` | GAP | **Not in token model** |
| `tokens.description` | GAP | **Not in token model** |
| `sales.total_raised_on_platform` | GAP | **Spec tracks on-platform vs total separately** — implementation has only `total_raised` |
| `sales.platform_fee_bps` | GAP | **Not in sale model** — fee comes from issuer config |
| `sales.fee_cap_usdc` | GAP | **Per-sale fee cap not implemented** |
| `sales.platform_fee_collected` | GAP | **Actual fee taken not tracked** |
| `contributions.is_otc` | GAP | **Not in contribution model** — OTC tracking missing |
| `vesting_schedules.is_revocable` | GAP | **Not in vesting model** |
| `vesting_schedules.is_revoked` | GAP | **Not in vesting model** |
| `redemption_requests.rejection_reason` | GAP | **Not in model** — spec allows issuer rejection with reason |
| `redemption_requests.delivery_details` (encrypted) | GAP | **Not in model** — spec has encrypted delivery info |
| `orders` table (P2P) | NOT IMPL | Phase 3 — expected |
| `wallets.registered_on_chain` | IMPL | Exists |

---

## API Endpoint Gaps (Spec vs Implementation)

| Spec Endpoint | Status | Notes |
|---|---|---|
| `PATCH /users/me` | GAP | **No profile update endpoint** |
| `DELETE /users/me/wallets/{address}` | IMPL | Via `unlinkWallet()` |
| `POST /tokens/{id}/deploy` (on-chain) | STUB | Returns fake address |
| `PATCH /tokens/{id}` | GAP | **No token metadata update endpoint** |
| `POST /sales/{id}/deploy` (on-chain) | GAP | **No sale contract deployment endpoint** |
| `POST /sales/{id}/phases` | GAP | **No endpoint to add phases to existing sale** |
| `PATCH /sales/{id}/phases/{phaseId}` | GAP | **No endpoint to update individual phase** |
| `GET /sales/{id}/contributions` | GAP | **No issuer-facing contributions list endpoint** |
| `POST /sales/{id}/otc-allocate` | GAP | **No OTC allocation endpoint** |
| `GET /portfolio/transactions` | GAP | **No transaction history endpoint** |
| `GET /portfolio/dividends` | GAP | **No dividend endpoint** |
| `GET /redemptions/{id}` | GAP | **No single redemption detail endpoint** |
| `PATCH /redemptions/{id}/approve` | GAP | **No separate approve endpoint** — uses generic `update_fulfillment()` |
| `PATCH /redemptions/{id}/reject` | GAP | **No reject with reason** |
| `POST /admin/compliance/trusted-issuers` | GAP | **No endpoint to manage TrustedIssuersRegistry** |
| `GET /admin/system/health` | GAP | **No system health endpoint (contracts, indexer status)** |
| `GET /admin/analytics` | GAP | **Returns stub data** |

---

## NEW DISCOVERIES (Not in Product Spec)

These gaps were found during the critical analysis that the product specification **does not address at all**.

### NEW-1: No Wallet Screening / Sanctions Checking
**Severity:** Critical for regulated platform

The product spec mentions "AML monitoring, sanctions screening" once in the compliance architecture diagram (line 1640) but **provides no detail on implementation**. The codebase has **zero wallet screening integration**.

**What's missing:**
- No Chainalysis, Elliptic, TRM Labs, or any wallet screening provider
- No OFAC/SDN sanctions list checking
- No automated screening on wallet link or contribution
- No transaction monitoring for suspicious activity
- Compliance is entirely manual (admin-initiated freeze/unfreeze)

**Spec gap:** The spec should define a wallet screening service integration (e.g., Chainalysis KYT) that runs on:
- Wallet linking (screen address before accepting)
- Every contribution (screen before processing)
- Periodic re-screening of existing wallets
- Incoming/outgoing transaction monitoring

### NEW-2: No MFA / Two-Factor Authentication
**Severity:** Critical for financial platform

Neither the spec nor the implementation includes MFA. For a platform handling regulated securities, this is a baseline requirement.

**What's missing:**
- No TOTP (Google Authenticator / Authy)
- No WebAuthn / passkeys
- No SMS 2FA (even as fallback)
- No MFA requirement for admin/issuer roles
- No step-up authentication for high-value transactions

### NEW-3: No Webhook Retry / Dead Letter Queue
**Severity:** High

The spec describes Sumsub webhook handling but doesn't address failure scenarios. If a webhook delivery fails (server down, timeout), the KYC status update is lost permanently.

**What's missing:**
- No retry mechanism for failed webhook processing
- No dead letter queue for failed events
- No idempotency keys on webhook processing
- No webhook event log for replay

### NEW-4: No Idempotency on Contributions
**Severity:** High

Neither spec nor implementation protects against double-submission of contributions. A network timeout during `contribute()` could result in duplicate charges.

**What's missing:**
- No idempotency key on contribution endpoint
- No deduplication by tx_hash before processing
- No optimistic locking on contribution creation

### NEW-5: No Compliance Acknowledgment in Investment Flow
**Severity:** Medium (legal requirement)

The spec explicitly calls for a "Compliance acknowledgment checkbox" and "I understand this is a regulated security" disclosure in Step 2 of the investment flow. **This is not implemented.**

### NEW-6: No KYC Expiry / Re-verification Monitoring
**Severity:** Medium

The spec mentions "Claims can have expiry dates" and "Backend monitors claim expirations and sends re-verification reminders." The `kyc_expires_at` field exists on the user model but:
- Nothing checks it
- No cron job or background task monitors expiry
- No re-verification reminders sent
- Expired claims would still work (backend doesn't validate)

### NEW-7: No Claim Expiry on ONCHAINID
**Severity:** Medium

Related to NEW-6: claims issued to ONCHAINID contracts should have expiry dates per the spec. The current claim issuance (what's partially implemented) does not set expiry timestamps.

### NEW-8: No Contract Address Storage
**Severity:** High

The spec data model stores per-token contract addresses (`identity_registry`, `compliance_address`) and per-sale `contract_address`. The implementation stores only the token's `contract_address` (which is currently a fake address). There's no registry of deployed contract addresses, making it impossible to interact with the right contracts.

### NEW-9: No Event Listener / Blockchain Poller
**Severity:** High

The spec architecture diagram shows a `blockchain/events.py` event listener. The spec's monitoring section calls for "On-chain event monitoring for anomalies." Neither exists. The database and blockchain can drift silently.

### NEW-10: No Circuit Breaker on Web3 RPC
**Severity:** Medium

If the Base RPC endpoint goes down, every request that touches Web3 will fail. No circuit breaker, fallback RPC, or graceful degradation exists.

### NEW-11: No Investor Communication System
**Severity:** Low (Phase 2+)

No way for issuers to broadcast messages to token holders. Not in spec either, but standard for tokenization platforms (Securitize, Tokeny both have this).

---

## Wallet Screening Verdict

**Is wallet screening part of the implementation?** **No.**

The spec mentions "AML monitoring, sanctions screening" exactly once in a high-level architecture diagram but provides no specification for how it should work. The codebase has zero wallet screening code — no provider integration, no screening hooks, no sanctions list checks.

For a platform that states it excludes "sanctioned nations" (spec section 1, Geographic Scope), the lack of automated sanctions screening is a critical gap. Currently, the only mechanism is the `CountryAllowModule` on-chain (which checks the country stored in ONCHAINID claims) and manual admin freeze — neither of which constitutes AML transaction monitoring.

**Recommendation:** Add a wallet screening section to the spec covering:
1. Provider selection (Chainalysis KYT, Elliptic Lens, or TRM Labs)
2. Screening triggers (wallet link, pre-contribution, periodic re-screen)
3. Risk scoring thresholds and automated actions (block, flag for review, allow)
4. SAR/STR filing workflow for flagged transactions
5. OFAC/SDN list checking frequency

---

## Priority Matrix: What to Fix First

### P0 — Blocks Launch

| Gap | Source | Impact |
|---|---|---|
| Web3 integration (token deploy, contribute, claim, comply) | Spec + Analysis | Platform cannot function on-chain |
| Wallet screening / sanctions checking | NEW | Regulatory non-compliance |
| MFA for all users (especially admin/issuer) | NEW | Security baseline for financial platform |
| Fix whitelist validation bug (`sale_contribute_service.py:108`) | Analysis | Runtime crash |
| Contract address storage (per-token registry, compliance addresses) | Spec | Cannot interact with deployed contracts |

### P1 — Required for Phase 1+2 Completeness

| Gap | Source | Impact |
|---|---|---|
| The Graph subgraph connected to app | Spec (Phase 1) | No real-time chain data |
| Safe / multisig support | Spec (Phase 2) | No institutional investor support |
| Accredited investor verification (Level 3) | Spec (Phase 2) | Cannot gate private rounds |
| Dividend distribution (backend + UI) | Spec (Phase 2) | Feature gap vs spec |
| Compliance acknowledgment in invest flow | Spec (Phase 1) | Legal requirement |
| KYC expiry monitoring + re-verification | Spec + NEW | Compliance gap |
| Redis JWT blacklist | Spec (Phase 1) | Revoked tokens still valid |
| OTC allocation endpoint + UI | Spec (Phase 2) | Feature gap for issuers |
| Per-sale fee cap (`feeCapUSDC`) | Spec (Phase 2) | Fee model incomplete |

### P2 — Required for Production Readiness

| Gap | Source | Impact |
|---|---|---|
| CI/CD pipeline (GitHub Actions) | Spec | No automated testing/deploy |
| Sentry error tracking | Spec | No production error visibility |
| Prometheus + Grafana metrics | Spec | No performance monitoring |
| Event listener / blockchain poller | Spec + NEW | DB/chain drift |
| Timelock on admin operations | Spec | Governance gap |
| HSM/KMS for deployer key | Spec | Key security |
| Database backup strategy | Spec | Data loss risk |
| Webhook retry / dead letter queue | NEW | Lost KYC updates |
| Idempotency on contributions | NEW | Double-charge risk |

### P3 — Phase 3 Features (Not Yet Planned)

| Gap | Source |
|---|---|
| P2P order board | Spec Phase 3 |
| ATS partnership | Spec Phase 3 |
| Token recovery (investor-facing flow) | Spec Phase 3 |
| Compliance module admin UI | Spec Phase 3 |
| Cross-chain deployment | Spec Phase 3 |
| Fiat on-ramp (MoonPay/Transak) | Spec Phase 3 |
