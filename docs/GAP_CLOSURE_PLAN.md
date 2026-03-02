# Cireta Gap Closure Plan
Generated: 2026-03-02

## Priority Order
1. HIGH (security + core function blockers)
2. MEDIUM (missing features/data)
3. LOW (route aliases, polish)
4. PHASE 3+ (skip — out of scope)

---

## HIGH PRIORITY

### H1 — Rate limiting + brute force protection
- **What:** Auth endpoints need rate limiting (10 req/min login, 5 reg/hr) + 5-fail lockout → 15min
- **Where:** `apps/api/api/v1/endpoints/auth.py`, `apps/api/main.py`
- **How:** Add `slowapi` rate limiter middleware + failed_attempts counter on User model

### H2 — ONCHAINID claims issuance
- **What:** After KYC approve, issue KYC claim + country claim + investor_type claim to user's ONCHAINID
- **Where:** `apps/api/services/kyc_service.py` → `_issue_onchain_claims()`
- **How:** Use web3.py to call ClaimIssuer contract, sign claim with platform key, call `addClaim()` on ONCHAINID

### H3 — Chainlink PoR live data
- **What:** Project detail page shows PoR widget — needs to actually read from Chainlink aggregator
- **Where:** `apps/api/api/v1/endpoints/tokens.py`, `apps/launchpad/src/app/project/[slug]/page.tsx`
- **How:** Add `/tokens/{id}/por` endpoint that reads `latestRoundData()` from ChainlinkPoRChecker contract; display in UI

---

## MEDIUM PRIORITY

### M1 — Notification preferences persisted to DB
- **What:** GET/PATCH /notifications/preferences currently returns hardcoded defaults, never saves
- **Where:** `apps/api/api/v1/endpoints/notifications.py`, add `notification_preferences` DB table
- **How:** New model `NotificationPreferences`, migration, update endpoint to read/write DB

### M2 — Platform admin overview endpoint
- **What:** `/admin/platform/overview` page renders mock data — needs real API endpoint
- **Where:** Add `GET /admin/platform/stats` in `apps/api/api/v1/endpoints/admin_issuers.py`
- **How:** Query: total users, total issuers, total TVL (sum contributions), active sales count, platform fees collected

### M3 — `recovery_log` DB model + audit trail
- **What:** Token recovery action exists (`/compliance/recover`) but no audit table persisting who/when/why
- **Where:** `apps/api/models/recovery_log.py` (create), `apps/api/services/compliance_service.py`
- **How:** Create RecoveryLog model, insert on every recovery action

### M4 — `token_documents` model + IPFS upload
- **What:** Token creation wizard Step 4 uploads docs — no DB table, no IPFS/Pinata integration
- **Where:** `apps/api/models/token_document.py` (create), new endpoint `POST /admin/issuer/tokens/{id}/documents`
- **How:** Create TokenDocument model, add Pinata API upload service, store IPFS hash in DB

### M5 — Sale phase whitelist enforcement
- **What:** `whitelistOnly` flag + whitelist address list in sale phases — not enforced in backend
- **Where:** `apps/api/api/v1/endpoints/sales.py` → contribute endpoint
- **How:** Add `sale_phase_whitelist` DB table, check on contribute if phase.whitelist_only

### M6 — `/platform/users` admin page
- **What:** Spec requires platform admin to view all users
- **Where:** `apps/admin/src/app/platform/users/page.tsx` (create)
- **How:** New admin page listing all users with KYC level, status, wallet count

### M7 — GitHub Actions CI/CD
- **What:** No `.github/workflows` — spec requires CI/CD
- **Where:** `.github/workflows/ci.yml`
- **How:** Build + test on push: `npm run build` (launchpad + admin) + `pytest` + `npx hardhat test`

### M8 — CSP headers
- **What:** Content Security Policy headers not set on frontend
- **Where:** `apps/launchpad/next.config.ts`, `apps/admin/next.config.ts`
- **How:** Add `headers()` config with CSP, X-Frame-Options, X-Content-Type-Options

---

## LOW PRIORITY

### L1 — `/portfolio/holdings` route alias
- **What:** Spec defines `/portfolio/holdings` as separate page — currently just `/portfolio`
- **Where:** `apps/launchpad/src/app/portfolio/holdings/page.tsx`
- **How:** Create page that redirects to or renders portfolio holdings section

### L2 — `/portfolio/vesting` route alias  
- **What:** Same — spec defines separate `/portfolio/vesting` route
- **Where:** `apps/launchpad/src/app/portfolio/vesting/page.tsx`
- **How:** Redirect to portfolio vesting section

### L3 — Safe multisig adapted UX
- **What:** Safe detected but UX not adapted (should say "Propose Transaction" not "Confirm")
- **Where:** `apps/launchpad/src/components/` — invest flow, claim buttons
- **How:** Check `isSafe` on wallet, swap button labels and add "Awaiting signatures" state

### L4 — Brute force lockout on User model
- **What:** Failed login counter + lockout timestamp on user
- **Where:** `apps/api/models/user.py` + `apps/api/services/auth_service.py`
- **How:** Add `failed_login_attempts` + `locked_until` fields, check on login

---

## EXECUTION ORDER
1. H1 (rate limiting) — auth.py + slowapi
2. H1b (brute force) — user model + auth service  
3. H2 (ONCHAINID claims) — kyc_service.py
4. H3 (Chainlink PoR) — tokens endpoint + UI
5. M1 (notification prefs DB) — model + migration
6. M2 (platform stats endpoint) — admin endpoint
7. M3 (recovery_log) — model + service
8. M4 (token_documents + IPFS) — model + Pinata service + endpoint
9. M5 (phase whitelist) — DB table + contribute check
10. M6 (platform/users page) — admin page
11. M7 (GitHub Actions) — CI workflow
12. M8 (CSP headers) — next.config
13. L1 (portfolio/holdings alias)
14. L2 (portfolio/vesting alias)
15. L3 (Safe UX)

---

## DONE WHEN
- All items above checked off
- `pytest` passing (108+ tests, new tests added for H1/H2)
- `npx hardhat test` passing
- Both frontend builds clean
- Final re-audit against spec confirms 100%
