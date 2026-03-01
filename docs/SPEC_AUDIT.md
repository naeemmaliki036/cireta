# Cireta Spec Audit — March 2026
**Spec version:** PRODUCT_SPEC.md v1.0
**Audit date:** 2026-03-01
**Status:** Full gap analysis

---

## Summary Scorecard

| Area | Score | Priority |
|------|-------|----------|
| Smart Contracts (core) | 11/15 | HIGH |
| Backend Auth | 4/10 | HIGH |
| Backend Wallets | 0/5 | HIGH — entire module missing |
| Backend Notifications | 0/6 | HIGH — entire module missing |
| Backend Dividends | 0/3 | HIGH — entire module missing |
| Backend Sales | 6/10 | HIGH |
| Backend Portfolio | 5/9 | MEDIUM |
| Backend Admin | 6/12 | MEDIUM |
| Launchpad Frontend | 7/15 | MEDIUM |
| Admin Frontend | 9/19 | MEDIUM |
| Tech Stack (Redis/BullMQ/Graph/Turborepo) | 0/4 | MEDIUM |

---

## ✅ What We Have

### Smart Contracts
- CiretaToken (ERC-3643) ✅
- IdentityRegistry, ModularCompliance, ClaimTopicsRegistry, IdentityRegistryStorage, TrustedIssuersRegistry ✅
- CiretaTokenFactory, CiretaSaleFactory ✅
- PlatformFeeManager, IssuerRegistry ✅
- Sale (multi-phase, soft/hard cap) ✅
- VestingVault ✅
- RedemptionManager ✅
- All 5 compliance modules (CountryAllow, MaxOwnership, MaxHolderCount, ConditionalTransfer, TimeTransfersLimit) ✅

### Backend
- Auth: register, login, refresh, logout, me ✅
- KYC: initiate, status, webhook (Sumsub-specific) ✅
- Tokens: CRUD ✅
- Sales: CRUD + contribute + finalize + claim ✅
- Portfolio: holdings, summary, vesting, vesting claim, redemptions ✅
- Admin: issuers CRUD + compliance actions + audit log + frozen addresses + investors ✅
- Issuer withdrawals endpoint ✅

### Frontend
- Launchpad: home, explore, project detail, invest flow, portfolio, claim, redeem, login, register, verify (KYC) ✅
- Admin: token list/detail/create, sale list/detail, investor list, compliance, withdrawals, platform issuers, platform analytics ✅
- Zero mock data ✅

---

## ❌ Gaps by Priority

### CRITICAL (Phase 1 MVP — blockers)

**Auth:**
- POST /auth/forgot-password — not implemented
- POST /auth/reset-password — not implemented
- GET /auth/verify-email/:token — not implemented
- Email verification on registration — not implemented
- Refresh token in httpOnly cookie (currently localStorage) — security gap
- Brute force lockout (5 attempts → 15min) — not implemented

**Wallets module (entire module missing):**
- GET /wallets
- POST /wallets (with SIWE-style signature verification)
- DELETE /wallets/:address
- PATCH /wallets/:address/primary
- Wallet model missing: `is_safe`, `registered_on_chain` fields
- Wallet linking removes from Identity Registry on delete

**Email sending:**
- No email service integrated (SendGrid/SES)
- No welcome email, KYC emails, investment confirmation, etc.

### HIGH (Phase 2 — current target)

**Smart Contracts:**
- DividendDistributor.sol — missing entirely
- Sale: `issuerAllocate()` function for OTC
- Sale: `claimRefund()` function for failed sales
- Sale: `fee_cap_usdc` parameter + OTC exclusion from fee + PlatformFeeManager.finalizeSale() integration

**Database schema gaps:**
- `users`: missing display_name, email_verified, email_verified_at, country_code, investor_type, kyc_provider, kyc_external_id, kyc_verified_at, kyc_expires_at
- `sales`: missing fee_cap_usdc, total_raised_on_platform, platform_fee_collected, contract_address
- `contributions`: missing is_otc, otc_reference
- `redemption_requests`: missing delivery_name, delivery_address, delivery_phone
- `issuers`: missing whitelisted_at, whitelisted_by
- Missing table: `notifications`
- Missing table: `recovery_log`
- Missing table: `token_documents`

**Backend modules:**
- Notifications (entire module): model, GET/PATCH endpoints, in-app + email delivery
- Dividends: POST /admin/issuer/dividends/deposit, GET /portfolio/dividends
- OTC allocation: POST /admin/issuer/sales/:id/otc
- GET /portfolio/transactions (transaction history)
- GET/POST /investments + /investments/:saleId/prepare
- GET /admin/issuer/reports/:type (CSV export)
- PATCH /admin/issuer/redemptions/:id (update status: shipped, fulfilled)
- GET /admin/platform/overview, /analytics, GET/PATCH /settings
- GET /admin/issuer/overview

**Frontend gaps:**
- Launchpad: /portfolio/dividends, /portfolio/transactions, /settings (profile, wallets, verification, notifications)
- Admin: /sales/:id/otc, /investors/:id, /compliance/recovery, /dividends, /redemptions, /reports, /platform/settings, /login
- Safe wallet detection + adapted UX
- TanStack Query / Zustand (currently plain useEffect)

### MEDIUM (Phase 2-3)

**Tech Stack:**
- Redis cache — not present
- BullMQ queue — not present
- The Graph subgraph — not present
- Turborepo + pnpm — not present
- GitHub Actions CI/CD — not present

**KYC:**
- KYC level 4 (Corporate KYB) — not implemented
- ONCHAINID deployment on KYC approval — not wired
- Wallet registration in Identity Registry on KYC approval — not wired
- Provider-agnostic interface — currently Sumsub-specific

### LOW / ARCHITECTURAL

**Backend framework:** Spec says NestJS (TypeScript). We built FastAPI (Python).
This is a functional platform but architecturally diverges from spec.
Decision required: keep FastAPI or migrate to NestJS.

**Sale states granularity:** Spec has FINALIZED_SUCCESS/FINALIZED_FAILED/TOKENS_DISTRIBUTED/REFUNDS_ENABLED.
Current: draft/active/paused/finalized/failed — less granular.

**Redemption status:** Missing SHIPPED state.

**Chainlink Proof of Reserve:** Phase 3, not started.

**ONCHAINID:** External dependency — not integrated with deployment pipeline.

---

## Recommended Next Build Order

1. **Wallet management endpoints** (GET/POST/DELETE/primary) — 2h
2. **Auth: forgot/reset-password + email verify** — 3h
3. **Email service integration** (SES/SendGrid, basic templates) — 2h
4. **DB schema migrations**: add missing fields to users, sales, contributions, redemptions — 1h
5. **DividendDistributor.sol** — 1h
6. **Sale contract: issuerAllocate + claimRefund + fee_cap + finalizeSale** — 2h
7. **Notifications module** (model + endpoints) — 3h
8. **OTC allocation** (endpoint + admin page) — 2h
9. **Portfolio dividends + transactions** — 2h
10. **Admin pages: OTC, dividends, redemptions, reports, recovery** — 4h
11. **Launchpad: /settings routes** — 2h
12. **Redis + BullMQ** for background jobs — 3h

---
*Generated by Zyda — 2026-03-01*
