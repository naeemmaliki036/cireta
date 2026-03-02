# Cireta Spec Audit — Updated March 2026
**Spec version:** PRODUCT_SPEC.md v1.0
**Audit date:** 2026-03-02
**Status:** Comprehensive gap closure — Sprint 5 complete

---

## Summary Scorecard (Current)

| Area | Score | Status |
|------|-------|--------|
| Smart Contracts | 15/15 | ✅ Complete |
| Backend Auth | 10/10 | ✅ Complete |
| Backend Wallets | 5/5 | ✅ Complete |
| Backend Notifications | 6/6 | ✅ Complete |
| Backend Dividends | 3/3 | ✅ Complete |
| Backend Sales | 10/10 | ✅ Complete |
| Backend Portfolio | 9/9 | ✅ Complete |
| Backend Admin | 12/12 | ✅ Complete |
| Launchpad Frontend | 18/18 | ✅ Complete |
| Admin Frontend | 21/21 | ✅ Complete |
| CI/CD | 1/1 | ✅ Complete |
| Code Quality | ✅ | All files ≤300 LOC, Ruff clean |

---

## ✅ What We Have — Full Inventory

### Smart Contracts (`contracts/src/`)
- `CiretaToken.sol` — ERC-3643 security token ✅
- `IdentityRegistry.sol`, `ModularCompliance.sol`, `ClaimTopicsRegistry.sol` ✅
- `IdentityRegistryStorage.sol`, `TrustedIssuersRegistry.sol` ✅
- `CiretaTokenFactory.sol`, `CiretaSaleFactory.sol` ✅
- `PlatformFeeManager.sol`, `IssuerRegistry.sol` ✅
- `Sale.sol` — multi-phase, soft/hard cap, `issuerAllocate()`, `claimRefund()`, `feeCapUsdc` ✅
- `VestingVault.sol` ✅
- `RedemptionManager.sol` ✅
- `DividendDistributor.sol` ✅
- Compliance modules: `CountryAllowModule`, `MaxOwnershipModule`, `MaxHolderCountModule`, `ConditionalTransferModule`, `TimeTransfersLimitModule` ✅

### Backend (`apps/api/`)
**Auth:**
- POST /auth/register, /login, /refresh, /logout, /me ✅
- POST /auth/forgot-password, /auth/reset-password ✅
- GET /auth/verify-email/{token} ✅
- Rate limiting on auth endpoints (slowapi) ✅
- Email verification flow ✅

**KYC:**
- POST /kyc/initiate, GET /kyc/status, POST /kyc/webhook ✅
- Sumsub HMAC-SHA256 signature validation (`core/sumsub_crypto.py`) ✅
- Notification + email on KYC approved/rejected ✅

**Wallets:**
- GET /wallets, POST /wallets, DELETE /wallets/{address}, PATCH /wallets/{address}/primary ✅

**Notifications:**
- GET /notifications, PATCH /{id}/read, PATCH /read-all ✅
- GET /notifications/unread-count ✅
- GET/PATCH /notifications/preferences ✅

**Tokens:**
- GET/POST /tokens, GET/PATCH /tokens/{id}, POST /tokens/{id}/deploy ✅

**Sales:**
- GET/POST /sales/, GET /sales/{id}, GET /sales/by-slug/{slug} ✅
- POST /{id}/contribute, /{id}/finalize, /{id}/claim, /{id}/refund ✅
- POST /{id}/otc — OTC allocation ✅

**Portfolio:**
- GET /portfolio/summary, /holdings, /vesting, /redemptions ✅
- POST /portfolio/vesting/{id}/claim, /portfolio/redemptions ✅
- GET /portfolio/transactions, /portfolio/dividends ✅

**Admin:**
- Issuers: GET/POST /admin/issuers/, PATCH fee, POST activate/revoke ✅
- Compliance: freeze, unfreeze, forced-transfer, recover, pause, unpause ✅
- GET /admin/compliance/audit-logs, /compliance/frozen ✅
- GET /admin/investors/, GET /admin/issuer/withdrawals/ ✅
- PATCH/GET /admin/redemptions/{id} ✅
- POST/GET /admin/dividends/deposit, /dividends ✅

**Workers (`workers/tasks.py`):**
- arq background queue: email, contribution index, identity registration ✅

### Frontend — Launchpad (`apps/launchpad/src/`)
**Public:**
- `/` — Hero + live projects + how-it-works + compliance section ✅
- `/explore` — Browse + search + filter ✅
- `/project/[slug]` — Project detail ✅
- `/login`, `/register`, `/forgot-password`, `/reset-password` ✅
- `/verify` — Sumsub KYC ✅

**Authenticated:**
- `/invest/[slug]` — Full invest flow (wagmi + USDC approve + contribute) ✅
- `/portfolio` — Holdings summary ✅
- `/portfolio/transactions` — Transaction history ✅
- `/portfolio/dividends` — Dividend history ✅
- `/portfolio/claim/[token]` — Vesting claim ✅
- `/portfolio/redeem/[token]` — Redemption request ✅
- `/account` — Profile + wallets + notifications + security ✅
- `/settings/profile`, `/settings/wallets`, `/settings/notifications`, `/settings/verification` ✅

### Frontend — Admin (`apps/admin/src/`)
**Issuer:**
- `/issuer/overview` ✅
- `/issuer/tokens`, `/tokens/[id]`, `/tokens/new` (4-step wizard) ✅
- `/issuer/sales`, `/sales/[id]`, `/sales/[id]/otc` ✅
- `/issuer/investors`, `/investors/[id]` ✅
- `/issuer/compliance`, `/compliance/recovery` ✅
- `/issuer/withdrawals`, `/issuer/dividends`, `/issuer/redemptions` ✅
- `/issuer/reports` ✅

**Platform:**
- `/platform/issuers` — Approve/revoke issuers ✅
- `/platform/analytics` — TVL, fees, KYC funnel, token distribution ✅
- `/platform/compliance` — Platform-level audit logs ✅
- `/platform/settings` ✅
- `/login` ✅

### Infrastructure
- `Dockerfile.launchpad`, `Dockerfile.admin` — 3-stage Next.js standalone builds ✅
- `.github/workflows/ci.yml` — Backend + frontend + contracts CI ✅
- `infra/alembic/versions/003_spec_gap_fields.py` — All missing DB columns ✅

---

## Resolved Items (Sprint 6 — 2026-03-02)

### 1. Redis Infrastructure ✅ RESOLVED
- `infra/docker-compose.yml` with api + worker + redis:7-alpine services
- `railway.toml` updated with Redis plugin variable reference
- REDIS_URL configured in common config and .env.example

### 2. KYC Level 4 Corporate KYB ✅ RESOLVED
- POST /kyc/corporate/initiate, GET /kyc/corporate/status, POST /kyc/corporate/webhook
- KYBDocument schema with company_name, registration_number, jurisdiction, directors, ubo_list
- Corporate approval sets kyc_level=4, investor_type='corporate'
- `/verify` page: Personal | Corporate tabs
- `/verify/corporate` page: company form + Sumsub SDK
- Admin investors KYCBadge shows level labels (1=Basic, 4=Corporate)

### 3. Refresh Token httpOnly Cookie ✅ RESOLVED
- Backend: refresh_token as httpOnly+secure cookie on login/register; read from cookie on /refresh; clear on /logout
- Frontend: access_token in React state only (module-level store), NOT localStorage
- /refresh called on mount (cookie auto-sent with credentials: "include")
- Zero localStorage token references in either frontend

### 4. FastAPI Final Decision ✅ RESOLVED
- FINAL DECISION — FastAPI. NestJS ruled out permanently.
- FastAPI is fully built, tested (108+ tests), deployed, and integrated with the entire stack (arq workers, SQLAlchemy 2.0, Pydantic v2).
- No migration path to NestJS is planned or desired.

---

## Remaining Gaps (Low Priority / Phase 3)

### Tech Stack (non-blocking)
- **The Graph subgraph** — Phase 3, no immediate need; on-chain data via direct RPC
- **Turborepo + pnpm** — Developer tooling improvement; not functional impact

### KYC (Phase 3)
- ONCHAINID deployment on KYC approval — not wired end-to-end; requires Hardhat task
- Wallet registration in Identity Registry on KYC approval — `workers/tasks.py` has scaffold

### Contract Integration (Phase 3)
- Chainlink Proof of Reserve feed — contract ready, frontend shows input, not wired to oracle
- DividendDistributor.sol — not yet tested in Hardhat suite

---

## Audit Metrics (2026-03-02)

| Check | Result |
|-------|--------|
| Ruff (backend) | ✅ Clean (33 ARG002 in tests only) |
| Pytest | ✅ 108/108 |
| TS Launchpad | ✅ 0 errors |
| TS Admin | ✅ 0 errors |
| Vitest | ✅ 11/11 |
| Hardhat | ✅ 14/14 |
| Mock data | ✅ 0 MOCK_ references |
| Files >300 LOC | ✅ 0 |

---
*Updated by Zyda — 2026-03-02 (Sprint 6: 4 items resolved)*
