# Cireta QA Audit — Full Test Plan

**Generated:** 2026-03-25
**Auditor:** Zyda (AI QA)
**System Version:** Cireta v2.0 (Base Sepolia)
**Approach:** Hostile, cross-layer, bug-bounty mindset

---

## Test Environment State

| Entity | Count | Notes |
|---|---|---|
| Users | 6 | admin, issuer, 3 investors (alice/bob/charlie), eve (blocked) |
| Tokens | 1 | TGLD — deployed on-chain, no sale deployed |
| Sales | 1 | Draft status, no contract deployed |
| Tables | 19 | Full schema |
| Contracts | 13 | Base Sepolia, factory pattern |

**Accounts:**
| Email | Role | KYC | Password |
|---|---|---|---|
| admin@cireta.io | admin | not_started | AdminPass123! |
| issuer@goldcorp.io | issuer | not_started | IssuerPass123! |
| alice@investor.io | investor | approved (L1) | AlicePass123! |
| bob@investor.io | investor | pending | BobPass123! |
| charlie@investor.io | investor | not_started | CharliePass123! |
| eve@blocked.io | investor | not_started | EvePass123! |

---

## Category 1: Authentication & Session Management (TC-001 → TC-035)

### 1.1 Registration

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-001 | Register with valid email + strong password | POST /auth/register | 201, JWT returned, user in DB | API, DB |
| TC-002 | Register with duplicate email | POST /auth/register | 409 Conflict | API |
| TC-003 | Register with weak password (no uppercase) | POST /auth/register | 422 validation error | API |
| TC-004 | Register with weak password (< 8 chars) | POST /auth/register | 422 validation error | API |
| TC-005 | Register with invalid email format | POST /auth/register | 422 validation error | API |
| TC-006 | Register with empty body | POST /auth/register | 422 validation error | API |
| TC-007 | Register with SQL injection in email (`'; DROP TABLE users;--`) | POST /auth/register | 422 or 201 (sanitized), no DB damage | API, DB |
| TC-008 | Register with XSS payload in display_name (`<script>alert(1)</script>`) | POST /auth/register | 201, payload stored escaped/sanitized | API, DB |
| TC-009 | Register 100 accounts rapidly (rate limit) | POST /auth/register ×100 | 429 after threshold | API |
| TC-010 | Verify registration creates user with correct role=investor, kyc_status=not_started | POST /auth/register + DB check | User exists with defaults | API, DB |

### 1.2 Login

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-011 | Login with valid credentials | POST /auth/login | 200, access_token + refresh_token | API |
| TC-012 | Login with wrong password | POST /auth/login | 401 | API |
| TC-013 | Login with nonexistent email | POST /auth/login | 401 (NOT 404 — no user enumeration) | API |
| TC-014 | Login with empty body | POST /auth/login | 422 | API |
| TC-015 | Login rate limit — 6 rapid failed attempts | POST /auth/login ×6 | 429 after 5th (or account lockout) | API, DB |
| TC-016 | Verify account lockout after N failed attempts (check `failed_login_attempts` + `locked_until` in DB) | POST /auth/login + DB | Account locked, DB fields updated | API, DB |
| TC-017 | Login to locked account with correct password | POST /auth/login | 401/403 with lockout message | API |
| TC-018 | Login with case-variant email (Admin@Cireta.IO) | POST /auth/login | 200 (case-insensitive) OR 401 (case-sensitive) — document which | API |

### 1.3 JWT & Token Management

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-019 | Access protected endpoint with valid JWT | GET /auth/me | 200, correct user data | API |
| TC-020 | Access protected endpoint with no JWT | GET /auth/me | 401 | API |
| TC-021 | Access protected endpoint with expired JWT (forge one with past exp) | GET /auth/me | 401 | API |
| TC-022 | Access protected endpoint with malformed JWT (`Bearer garbage123`) | GET /auth/me | 401 | API |
| TC-023 | Access protected endpoint with JWT signed by wrong key | GET /auth/me | 401 | API |
| TC-024 | Refresh token — obtain new access token | POST /auth/refresh | 200, new tokens | API |
| TC-025 | Refresh with invalid/expired refresh token | POST /auth/refresh | 401 | API |
| TC-026 | Logout — verify access token blacklisted in Redis | POST /auth/logout + Redis check | Token in Redis blacklist | API, Redis |
| TC-027 | Use blacklisted access token after logout | GET /auth/me | 401 | API |
| TC-028 | JWT payload tampering — modify `role` claim from investor to admin | GET /admin/... | 401/403 — signature invalid | API |

### 1.4 Password Reset

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-029 | Forgot password with valid email | POST /auth/forgot-password | 200 (always, no enumeration) | API |
| TC-030 | Forgot password with unknown email | POST /auth/forgot-password | 200 (same response — no enumeration) | API |
| TC-031 | Reset password with valid token (if accessible) | POST /auth/reset-password | 200, password changed | API, DB |
| TC-032 | Reset password with invalid/expired token | POST /auth/reset-password | 400/401 | API |

### 1.5 MFA (TOTP)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-033 | Setup MFA — get secret + QR URI | POST /auth/mfa/setup | 200, secret returned | API |
| TC-034 | Enable MFA with valid TOTP code | POST /auth/mfa/enable | 200, backup codes returned, DB `mfa_enabled=true` | API, DB |
| TC-035 | Login with MFA enabled — require verification step | POST /auth/login + POST /auth/mfa/verify | Partial JWT → full JWT after verify | API |

---

## Category 2: Authorization & RBAC (TC-036 → TC-060)

### 2.1 Role Enforcement — Investors Cannot Access Admin/Issuer Endpoints

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-036 | Investor → GET /admin/issuers/ | GET | 403 | API |
| TC-037 | Investor → POST /admin/issuers/ | POST | 403 | API |
| TC-038 | Investor → GET /admin/compliance/audit-logs | GET | 403 | API |
| TC-039 | Investor → POST /admin/compliance/freeze | POST | 403 | API |
| TC-040 | Investor → GET /admin/platform/settings | GET | 403 | API |
| TC-041 | Investor → PATCH /admin/platform/settings | PATCH | 403 | API |
| TC-042 | Investor → POST /tokens/ (create token) | POST | 403 | API |
| TC-043 | Investor → POST /sales/ (create sale) | POST | 403 | API |

### 2.2 Role Enforcement — Issuers Cannot Access Platform Admin

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-044 | Issuer → GET /admin/platform/settings | GET | 403 | API |
| TC-045 | Issuer → PATCH /admin/platform/settings | PATCH | 403 | API |
| TC-046 | Issuer → GET /admin/issuers/ (list all issuers) | GET | 403 | API |
| TC-047 | Issuer → POST /admin/issuers/ (create issuer) | POST | 403 | API |

### 2.3 Ownership Enforcement — Issuer A Cannot Modify Issuer B's Assets

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-048 | Issuer A deploys sale for Issuer B's token | POST /sales/{b_token_sale}/deploy | 403 | API |
| TC-049 | Issuer A finalizes Issuer B's sale | POST /sales/{b_sale}/finalize | 403 | API |
| TC-050 | Issuer A freezes address on Issuer B's token | POST /admin/compliance/freeze (b_token) | 403 | API |

### 2.4 Horizontal Privilege Escalation

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-051 | User A reads User B's portfolio | GET /portfolio/holdings (with A's token) | Only A's data | API, DB |
| TC-052 | User A reads User B's notification preferences | GET /notifications/preferences | Only A's prefs | API |
| TC-053 | User A claims User B's vesting schedule | POST /portfolio/vesting/{b_schedule}/claim | 403/404 | API |
| TC-054 | User A views User B's KYC status | GET /kyc/status (with A's token) | Only A's status | API |

### 2.5 Unauthenticated Access

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-055 | No auth → GET /tokens/ (public listing) | GET | 200 (public) or 401 (protected) — document which | API |
| TC-056 | No auth → GET /sales/ (public listing) | GET | 200 or 401 | API |
| TC-057 | No auth → POST /sales/{id}/contribute | POST | 401 | API |
| TC-058 | No auth → POST /admin/compliance/freeze | POST | 401 | API |
| TC-059 | No auth → GET /portfolio/holdings | GET | 401 | API |
| TC-060 | No auth → POST /auth/logout | POST | 401 | API |

---

## Category 3: Token Management (TC-061 → TC-080)

### 3.1 Token CRUD

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-061 | Create token with valid data (issuer) | POST /tokens/ | 201, token in DB | API, DB |
| TC-062 | Create token with missing required field (name) | POST /tokens/ | 422 | API |
| TC-063 | Create token with negative total_supply | POST /tokens/ | 422 | API |
| TC-064 | Create token with zero total_supply | POST /tokens/ | 422 | API |
| TC-065 | Create token with extremely large total_supply (10^30) | POST /tokens/ | 422 or overflow check | API |
| TC-066 | Create token with duplicate symbol (same issuer) | POST /tokens/ | 409 or 422 | API |
| TC-067 | Get token by valid ID | GET /tokens/{id} | 200, correct data | API |
| TC-068 | Get token by nonexistent ID | GET /tokens/{id} | 404 | API |
| TC-069 | List tokens — verify pagination | GET /tokens/?page=1&limit=10 | 200, paginated | API |

### 3.2 Token Deployment (On-Chain)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-070 | Deploy token on-chain (issuer, valid token) | POST /tokens/{id}/deploy | 200, contract_address in DB, contract exists on-chain | API, DB, Chain |
| TC-071 | Deploy already-deployed token | POST /tokens/{id}/deploy | 400 (already deployed) | API |
| TC-072 | Deploy token as investor (not issuer) | POST /tokens/{id}/deploy | 403 | API |
| TC-073 | Verify deployed token name/symbol on-chain matches DB | cast call + DB | Match | DB, Chain |
| TC-074 | Verify deployed token has IdentityRegistry linked on-chain | cast call | Non-zero address | Chain |

### 3.3 Token Documents

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-075 | Upload document to token | POST /tokens/{id}/documents | 200/201 | API, DB |
| TC-076 | Upload document with no name | POST /tokens/{id}/documents | 422 | API |
| TC-077 | Upload document to nonexistent token | POST /tokens/{fake_id}/documents | 404 | API |
| TC-078 | Upload document as investor (not owner) | POST /tokens/{id}/documents | 403 | API |

### 3.4 Proof of Reserve

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-079 | Get PoR for token with Chainlink feed | GET /tokens/{id}/por | 200, reserve data | API |
| TC-080 | Get PoR for token without Chainlink feed | GET /tokens/{id}/por | 200 with null/empty or 404 | API |

---

## Category 4: Sale Lifecycle (TC-081 → TC-120)

### 4.1 Sale Creation

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-081 | Create sale with valid phases | POST /sales/ | 201, sale in DB with phases | API, DB |
| TC-082 | Create sale with no phases | POST /sales/ | 422 | API |
| TC-083 | Create sale with soft_cap > hard_cap | POST /sales/ | 422 | API |
| TC-084 | Create sale with negative prices | POST /sales/ | 422 | API |
| TC-085 | Create sale with phase end_time before start_time | POST /sales/ | 422 | API |
| TC-086 | Create sale for token owned by different issuer | POST /sales/ | 403 | API |
| TC-087 | Create sale as investor | POST /sales/ | 403 | API |
| TC-088 | Verify sale slug is auto-generated and unique | POST /sales/ + DB check | slug NOT NULL, unique | API, DB |

### 4.2 Sale Deployment (On-Chain)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-089 | Deploy sale on-chain | POST /sales/{id}/deploy | 200, sale_contract_address in DB, contract on-chain | API, DB, Chain |
| TC-090 | Deploy sale for un-deployed token | POST /sales/{id}/deploy | 400 (token not deployed) | API |
| TC-091 | Deploy already-deployed sale | POST /sales/{id}/deploy | 400 | API |
| TC-092 | Read on-chain sale status after deploy | GET /sales/{id}/on-chain | 200, status/totalRaised/phases from chain | API, Chain |
| TC-093 | Verify on-chain phase count matches DB phase count | GET on-chain + DB | Match | DB, Chain |

### 4.3 Contributions

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-094 | Contribute to active sale (KYC'd investor) | POST /sales/{id}/contribute | 200, contribution in DB | API, DB |
| TC-095 | Contribute to sale without KYC | POST /sales/{id}/contribute | 403 | API |
| TC-096 | Contribute to draft sale (not deployed/active) | POST /sales/{id}/contribute | 400 | API |
| TC-097 | Contribute without auth | POST /sales/{id}/contribute | 401 | API |
| TC-098 | Contribute with amount below phase minimum | POST /sales/{id}/contribute | 400/422 | API |
| TC-099 | Contribute with amount above phase maximum | POST /sales/{id}/contribute | 400/422 | API |
| TC-100 | Contribute with amount=0 | POST /sales/{id}/contribute | 422 | API |
| TC-101 | Contribute with negative amount | POST /sales/{id}/contribute | 422 | API |
| TC-102 | Contribute exceeding hard_cap | POST /sales/{id}/contribute | 400 | API |
| TC-103 | Double contribution — verify amounts add up correctly in DB | POST contribute ×2 | Both recorded, total correct | API, DB |

### 4.4 Sale Finalization

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-104 | Finalize sale that reached soft cap | POST /sales/{id}/finalize | 200, status=finalized_success | API, DB |
| TC-105 | Finalize sale that did NOT reach soft cap | POST /sales/{id}/finalize | 200, status=finalized_failed | API, DB |
| TC-106 | Finalize already-finalized sale | POST /sales/{id}/finalize | 400 | API |
| TC-107 | Finalize as investor (not issuer) | POST /sales/{id}/finalize | 403 | API |

### 4.5 Claims & Refunds

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-108 | Claim tokens from successful sale | POST /sales/{id}/claim | 200, tokens transferred | API, DB |
| TC-109 | Claim from failed sale | POST /sales/{id}/claim | 400 | API |
| TC-110 | Claim with no contributions | POST /sales/{id}/claim | 404 | API |
| TC-111 | Double claim — second should fail | POST /sales/{id}/claim ×2 | First 200, second 400 | API, DB |
| TC-112 | Refund from failed sale | POST /sales/{id}/refund | 200, USDC returned | API, DB |
| TC-113 | Refund from successful sale | POST /sales/{id}/refund | 400 | API |
| TC-114 | Refund with no contributions | POST /sales/{id}/refund | 404 | API |

### 4.6 OTC Allocation

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-115 | OTC allocate tokens to investor | POST /sales/{id}/otc | 200, allocation in DB | API, DB |
| TC-116 | OTC allocate as investor (not issuer) | POST /sales/{id}/otc | 403 | API |
| TC-117 | OTC allocate to nonexistent user | POST /sales/{id}/otc | 404/422 | API |
| TC-118 | OTC allocate exceeding remaining allocation | POST /sales/{id}/otc | 400 | API |

### 4.7 Sale Listing & Discovery

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-119 | Get sale by slug | GET /sales/by-slug/{slug} | 200, correct sale | API |
| TC-120 | Get sale by nonexistent slug | GET /sales/by-slug/{fake} | 404 | API |

---

## Category 5: KYC / Identity (TC-121 → TC-140)

### 5.1 KYC Initiation

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-121 | Initiate KYC (first time) | POST /kyc/initiate | 200, application created | API, DB |
| TC-122 | Initiate KYC (duplicate — already pending) | POST /kyc/initiate | 409 | API |
| TC-123 | Initiate KYC without auth | POST /kyc/initiate | 401 | API |
| TC-124 | Check KYC status | GET /kyc/status | 200, correct status | API |
| TC-125 | Check KYC status without auth | GET /kyc/status | 401 | API |

### 5.2 KYC Webhook Processing

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-126 | Sumsub webhook — applicantReviewed (approved) | POST /kyc/webhook | 200, user kyc_status=approved in DB | API, DB |
| TC-127 | Sumsub webhook — invalid HMAC signature | POST /kyc/webhook (bad sig) | 401/403 | API |
| TC-128 | Sumsub webhook — replay same webhook twice | POST /kyc/webhook ×2 | Idempotent — no duplicate processing | API, DB |
| TC-129 | Sumsub webhook — unknown applicant ID | POST /kyc/webhook | 200 (logged, no crash) | API |

### 5.3 Corporate KYC

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-130 | Initiate corporate KYC | POST /kyc/corporate/initiate | 200 | API |
| TC-131 | Check corporate KYC status | GET /kyc/corporate/status | 200 | API |

### 5.4 ONCHAINID (On-Chain Identity)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-132 | Verify KYC-approved user has ONCHAINID deployed | DB check + chain | `onchain_id` in DB is valid contract address | DB, Chain |
| TC-133 | Verify ONCHAINID has KYC claim issued | Chain call | Claim exists with correct topic | Chain |
| TC-134 | Verify non-KYC'd user has NO ONCHAINID | DB check | `onchain_id` is NULL | DB |
| TC-135 | Verify wallet is registered in Identity Registry | Chain call | `isVerified(wallet)` returns true | Chain |

### 5.5 KYC-Gated Operations

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-136 | KYC-approved investor can contribute | POST /sales/{id}/contribute | 200 | API |
| TC-137 | KYC-pending investor cannot contribute | POST /sales/{id}/contribute | 403 | API |
| TC-138 | KYC-not_started investor cannot contribute | POST /sales/{id}/contribute | 403 | API |
| TC-139 | On-chain: transfer token to non-KYC'd address | cast send (transfer) | Revert | Chain |
| TC-140 | On-chain: transfer token between KYC'd addresses | cast send (transfer) | Success | Chain |

---

## Category 6: Wallet Management (TC-141 → TC-155)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-141 | List wallets (empty) | GET /wallets/ | 200, empty array | API |
| TC-142 | Link wallet without SIWE signature | POST /wallets/ (no sig) | 422 | API |
| TC-143 | Link wallet without auth | POST /wallets/ | 401 | API |
| TC-144 | Link wallet with valid SIWE signature | POST /wallets/ (with sig) | 200, wallet in DB | API, DB |
| TC-145 | Link same wallet twice | POST /wallets/ ×2 | 409 (duplicate) | API |
| TC-146 | Link wallet already owned by different user | POST /wallets/ | 409/400 | API |
| TC-147 | List wallets after linking | GET /wallets/ | 200, contains linked wallet | API |
| TC-148 | Set primary wallet | PATCH /wallets/{id} (primary=true) | 200, DB updated | API, DB |
| TC-149 | SQL injection in wallet address field | POST /wallets/ | 422 or sanitized | API, DB |
| TC-150 | XSS in wallet label/name field | POST /wallets/ | Stored sanitized | API, DB |

---

## Category 7: Portfolio (TC-151 → TC-170)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-151 | Get holdings (empty — no contributions) | GET /portfolio/holdings | 200, empty array | API |
| TC-152 | Get portfolio summary (empty) | GET /portfolio/summary | 200, zeroed summary | API |
| TC-153 | Get vesting schedules (empty) | GET /portfolio/vesting | 200, empty array | API |
| TC-154 | Get transactions (empty) | GET /portfolio/transactions | 200, empty array | API |
| TC-155 | Get dividends (empty) | GET /portfolio/dividends | 200, empty array | API |
| TC-156 | Get redemptions (empty) | GET /portfolio/redemptions | 200, empty array | API |
| TC-157 | No auth → portfolio | GET /portfolio/* | 401 | API |
| TC-158 | Request redemption | POST /portfolio/redemptions | 201 | API, DB |
| TC-159 | Request redemption for unowned token | POST /portfolio/redemptions | 400/403 | API |
| TC-160 | Claim vesting — invalid schedule ID | POST /portfolio/vesting/{fake}/claim | 404 | API |
| TC-161 | Vault claimable check for active sale | GET /portfolio/vesting/{sale}/claimable | 200, amount | API |

---

## Category 8: Compliance (TC-162 → TC-195)

### 8.1 Freeze/Unfreeze

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-162 | Freeze address (admin) | POST /admin/compliance/freeze | 200, audit log created | API, DB |
| TC-163 | Freeze already-frozen address | POST /admin/compliance/freeze | 400 or idempotent 200 | API |
| TC-164 | Freeze with no data | POST /admin/compliance/freeze | 422 | API |
| TC-165 | Freeze as investor | POST /admin/compliance/freeze | 403 | API |
| TC-166 | Unfreeze address | POST /admin/compliance/unfreeze | 200, audit log | API, DB |
| TC-167 | List frozen addresses | GET /admin/compliance/frozen | 200, includes frozen addr | API |

### 8.2 Forced Transfer & Recovery

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-168 | Forced transfer (admin) | POST /admin/compliance/forced-transfer | 200, audit log | API, DB |
| TC-169 | Forced transfer as investor | POST /admin/compliance/forced-transfer | 403 | API |
| TC-170 | Forced transfer with invalid addresses | POST /admin/compliance/forced-transfer | 422 | API |
| TC-171 | Token recovery from frozen address | POST /admin/compliance/recover | 200, audit log | API, DB |
| TC-172 | Recovery from non-frozen address | POST /admin/compliance/recover | 400 | API |

### 8.3 Pause/Unpause

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-173 | Pause token transfers | POST /admin/compliance/pause/{token_id} | 200, audit log | API, DB |
| TC-174 | Unpause token | POST /admin/compliance/unpause/{token_id} | 200, audit log | API, DB |
| TC-175 | Pause nonexistent token | POST /admin/compliance/pause/{fake_id} | 404 | API |
| TC-176 | Pause as investor | POST /admin/compliance/pause/{token_id} | 403 | API |

### 8.4 Audit Logs

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-177 | Get audit logs (admin) | GET /admin/compliance/audit-logs | 200, list of logs | API |
| TC-178 | Get audit logs as investor | GET /admin/compliance/audit-logs | 403 | API |
| TC-179 | Get recovery logs | GET /admin/compliance/recovery-logs | 200, list | API |
| TC-180 | Verify each compliance action creates audit log with correlation_id | Execute action + check DB | Audit log with correct action_type, correlation_id | API, DB |

---

## Category 9: Notifications (TC-181 → TC-195)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-181 | List notifications (empty) | GET /notifications | 200, empty | API |
| TC-182 | Get unread count | GET /notifications/unread-count | 200, count=0 | API |
| TC-183 | Mark notification as read | PATCH /notifications/{id}/read | 200 | API, DB |
| TC-184 | Mark nonexistent notification read | PATCH /notifications/{fake_id}/read | 404 | API |
| TC-185 | Mark all as read | PATCH /notifications/read-all | 200 | API, DB |
| TC-186 | Get notification preferences | GET /notifications/preferences | 200, preference object | API |
| TC-187 | Update notification preferences | PATCH /notifications/preferences | 200, updated | API, DB |
| TC-188 | No auth → notifications | GET /notifications | 401 | API |

---

## Category 10: Admin Operations (TC-189 → TC-215)

### 10.1 Issuer Management

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-189 | List issuers (admin) | GET /admin/issuers/ | 200, list | API |
| TC-190 | Create issuer (admin) | POST /admin/issuers/ | 201, issuer in DB | API, DB |
| TC-191 | Create issuer with invalid data | POST /admin/issuers/ | 422 | API |
| TC-192 | Set issuer fee rate | PATCH /admin/issuers/{id}/fee | 200, fee updated in DB | API, DB |
| TC-193 | Revoke issuer | POST /admin/issuers/{id}/revoke | 200, status=revoked | API, DB |
| TC-194 | Activate revoked issuer | POST /admin/issuers/{id}/activate | 200, status=active | API, DB |
| TC-195 | Revoked issuer tries to create token | POST /tokens/ (revoked issuer JWT) | 403 | API |

### 10.2 Platform Stats & Settings

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-196 | Get platform stats (admin) | GET /admin/platform/stats | 200, accurate counts from DB | API, DB |
| TC-197 | Get platform settings | GET /admin/platform/settings | 200, settings object | API |
| TC-198 | Update platform setting | PATCH /admin/platform/settings | 200, DB updated | API, DB |
| TC-199 | Platform stats as investor | GET /admin/platform/stats | 403 | API |

### 10.3 Dividends

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-200 | Deposit dividends (admin) | POST /admin/dividends/deposit | 200 | API, DB |
| TC-201 | Deposit dividends for specific token | POST /admin/dividends/{token_id}/deposit | 200 | API, DB |
| TC-202 | Deposit dividends as investor | POST /admin/dividends/deposit | 403 | API |
| TC-203 | List dividend distributions | GET /admin/dividends | 200 | API |

### 10.4 Redemptions

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-204 | List redemption requests (admin) | GET /admin/redemptions | 200 | API |
| TC-205 | Update redemption status (admin) | PATCH /admin/redemptions/{id} | 200, status updated in DB | API, DB |
| TC-206 | Update redemption as investor | PATCH /admin/redemptions/{id} | 403 | API |

### 10.5 Webhooks

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-207 | List webhook events | GET /admin/webhooks | 200, events list | API |
| TC-208 | Replay webhook | POST /admin/webhooks/{id}/replay | 200 | API |

### 10.6 Withdrawals (Issuer)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-209 | List withdrawals (issuer) | GET /issuer/withdrawals/ | 200 | API |
| TC-210 | Withdraw from finalized successful sale | POST /issuer/withdrawals/{sale_id}/withdraw | 200 | API, DB |
| TC-211 | Withdraw from non-finalized sale | POST /issuer/withdrawals/{sale_id}/withdraw | 400 | API |
| TC-212 | Withdraw as investor | POST /issuer/withdrawals/{sale_id}/withdraw | 403 | API |

---

## Category 11: Input Validation & Injection (TC-213 → TC-235)

### 11.1 SQL Injection Attempts

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-213 | SQL injection in login email | POST /auth/login email=`' OR 1=1 --` | 401, no data leak | API, DB |
| TC-214 | SQL injection in search/filter params | GET /tokens/?name=`'; DROP TABLE tokens; --` | 200 (empty) or 422, tables intact | API, DB |
| TC-215 | SQL injection in UUID path param | GET /tokens/`1; DROP TABLE tokens` | 422 (invalid UUID) | API |
| TC-216 | SQL injection in token creation name | POST /tokens/ name=`x' OR '1'='1` | 201 (stored as literal) | API, DB |

### 11.2 XSS Attempts

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-217 | XSS in token name | POST /tokens/ name=`<img src=x onerror=alert(1)>` | Stored, rendered safely in UI | API, DB, UI |
| TC-218 | XSS in sale phase name | POST /sales/ phase.name=`<script>` | Stored, rendered safely | API, DB, UI |
| TC-219 | XSS in display_name | POST /auth/register name=`<svg onload=alert(1)>` | Stored safely | API, DB, UI |

### 11.3 Boundary & Type Confusion

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-220 | Integer overflow in contribution amount | POST /sales/{id}/contribute amount=9999999999999999999 | 422 or handled gracefully | API |
| TC-221 | Float precision attack — amount=0.000000000000000001 | POST /sales/{id}/contribute | 422 or rounded | API |
| TC-222 | Negative amount in contribution | POST /sales/{id}/contribute amount=-100 | 422 | API |
| TC-223 | String where number expected | POST /sales/{id}/contribute amount="not_a_number" | 422 | API |
| TC-224 | Extremely long string in name field (10000 chars) | POST /tokens/ name=AAAA...×10000 | 422 | API |
| TC-225 | Unicode/emoji in token name | POST /tokens/ name=🚀🌙 | 201 or 422 | API |
| TC-226 | Null bytes in string fields | POST /tokens/ name=`test\x00injected` | 422 or sanitized | API |

### 11.4 IDOR & Path Traversal

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-227 | Access other user's resources by guessing UUID | GET /tokens/{other_user_token_id} | 200 (public) or 403 (private) | API |
| TC-228 | Path traversal in document upload | POST /tokens/{id}/documents filename=`../../../etc/passwd` | 422 or sanitized | API |

---

## Category 12: Rate Limiting & DoS (TC-229 → TC-240)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-229 | Login brute force — 50 attempts in 60s | POST /auth/login ×50 | 429 after threshold | API |
| TC-230 | Registration spam — 50 attempts in 60s | POST /auth/register ×50 | 429 after threshold | API |
| TC-231 | API endpoint flooding — 200 requests in 10s | GET /tokens/ ×200 | 429 after threshold | API |
| TC-232 | Contribution spam — rapid contribute calls | POST /sales/{id}/contribute ×20 | Rate limited | API |
| TC-233 | Verify rate limit headers present | Any rate-limited endpoint | `X-RateLimit-Limit`, `X-RateLimit-Remaining` in response | API |
| TC-234 | Verify rate limit resets after window | Wait + retry | Success after cooldown | API |

---

## Category 13: On-Chain Verification (TC-235 → TC-260)

### 13.1 Token Contract State

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-235 | Verify token name on-chain matches DB | cast call name() | Match | DB, Chain |
| TC-236 | Verify token symbol on-chain matches DB | cast call symbol() | Match | DB, Chain |
| TC-237 | Verify token totalSupply on-chain | cast call totalSupply() | Expected amount | Chain |
| TC-238 | Verify token owner is issuer or factory | cast call owner() | Correct owner | Chain |
| TC-239 | Verify compliance module is bound | cast call compliance() | Non-zero address | Chain |
| TC-240 | Verify identity registry is bound | cast call identityRegistry() | Non-zero address | Chain |

### 13.2 Sale Contract State

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-241 | Verify sale status on-chain | cast call status() | Matches DB status | DB, Chain |
| TC-242 | Verify sale totalRaised on-chain | cast call totalRaised() | Matches DB total | DB, Chain |
| TC-243 | Verify sale phase count on-chain | cast call getPhaseCount() | Matches DB | DB, Chain |
| TC-244 | Verify sale softCap/hardCap on-chain | cast call softCap(), hardCap() | Match DB | DB, Chain |
| TC-245 | Verify sale payment token is USDC | cast call paymentToken() | USDC address | Chain |

### 13.3 ERC-3643 Compliance Enforcement

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-246 | Transfer between KYC'd addresses | cast send transfer(to, amount) | Success | Chain |
| TC-247 | Transfer TO non-KYC'd address | cast send transfer(to, amount) | REVERT | Chain |
| TC-248 | Transfer FROM frozen address | cast send transfer(to, amount) from frozen | REVERT | Chain |
| TC-249 | Transfer while token is paused | cast send transfer(to, amount) | REVERT | Chain |
| TC-250 | Verify canTransfer returns false for non-KYC'd | cast call canTransfer(from, to, amount) | false | Chain |

### 13.4 Vault & Fraction (Vested Mode)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-251 | Verify vault holds correct token balance | cast call balanceOf(vault) | Expected | Chain |
| TC-252 | Verify fraction token supply matches allocations | cast call totalSupply() | Expected | Chain |
| TC-253 | Verify vesting schedule on-chain | cast call getVested(investor) | Correct amount | Chain |
| TC-254 | Claim from vault — burns fractions, releases tokens | cast send claim() | Balance changes correct | Chain |
| TC-255 | Claim more than vested amount | cast send claim() with manipulation | REVERT | Chain |

### 13.5 Dividend Distribution

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-256 | Deposit dividends on-chain | cast send deposit(amount) | Success, USDC transferred | Chain |
| TC-257 | Claim dividends as token holder | cast send claimDividend() | USDC received | Chain |
| TC-258 | Claim dividends with zero balance | cast send claimDividend() | 0 or REVERT | Chain |
| TC-259 | Double claim dividends | cast send claimDividend() ×2 | Second returns 0 | Chain |

---

## Category 14: UI/Browser Testing (TC-260 → TC-290)

### 14.1 Launchpad — Auth Flow

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-260 | Register page renders | Browser navigate | Form visible, no errors | UI |
| TC-261 | Login page renders | Browser navigate | Form visible, no errors | UI |
| TC-262 | Login with valid credentials | Browser form submit | Redirected to dashboard/portfolio | UI, API |
| TC-263 | Login with invalid credentials | Browser form submit | Error message shown, no redirect | UI |
| TC-264 | Logout clears session | Browser click logout | Redirected to login, protected routes inaccessible | UI |

### 14.2 Launchpad — Browse & Invest

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-265 | Explore page lists tokens/sales | Browser navigate | Cards rendered with correct data | UI, API |
| TC-266 | Project detail page renders | Browser navigate to /project/{slug} | Full project info, sale phases, pricing | UI, API |
| TC-267 | Connect wallet button works | Browser click | WalletConnect modal appears | UI |
| TC-268 | Portfolio page renders (logged in) | Browser navigate | Holdings/summary displayed | UI, API |
| TC-269 | Portfolio page redirects (not logged in) | Browser navigate | Redirect to login | UI |

### 14.3 Admin — Dashboard & CRUD

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-270 | Admin login page renders | Browser navigate | Form visible | UI |
| TC-271 | Admin login with issuer credentials | Browser login | Redirected to issuer dashboard | UI, API |
| TC-272 | Admin dashboard shows correct stats | Browser navigate | Numbers match API stats | UI, API |
| TC-273 | Create token form — all fields present | Browser navigate to /issuer/tokens/new | All required fields rendered | UI |
| TC-274 | Create token form — submit valid data | Browser form submit | Token created, redirected to token detail | UI, API, DB |
| TC-275 | Token list shows created tokens | Browser navigate | Correct tokens listed | UI, API |
| TC-276 | Sale creation form — phases UI works | Browser navigate | Can add/remove phases | UI |
| TC-277 | Compliance page — freeze form present | Browser navigate | Freeze input + button | UI |
| TC-278 | Compliance page — audit logs visible | Browser navigate | Log table rendered | UI |

### 14.4 UI Error Handling

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-279 | Navigate to nonexistent page | Browser /404-test | 404 page or redirect | UI |
| TC-280 | API down — launchpad handles gracefully | Kill API, load page | Error boundary shown, no crash | UI |
| TC-281 | Expired JWT — UI handles refresh or redirect | Wait for token expiry | Auto-refresh or redirect to login | UI |
| TC-282 | Console errors on any page load | Browser DevTools | ZERO console errors | UI |

### 14.5 UI Security

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-283 | No sensitive data in localStorage | Browser DevTools → Application | No JWT, passwords, or secrets in localStorage | UI |
| TC-284 | No sensitive data in URL params | Navigate around | No tokens or PII in URLs | UI |
| TC-285 | CSP headers present | Check response headers | Content-Security-Policy set | API |
| TC-286 | X-Frame-Options set | Check response headers | DENY or SAMEORIGIN | API |
| TC-287 | Strict-Transport-Security set | Check response headers | HSTS present | API |

---

## Category 15: Concurrency & Race Conditions (TC-288 → TC-300)

| ID | Test Case | Method | Expected | Layers |
|---|---|---|---|---|
| TC-288 | Concurrent contributions — 5 simultaneous requests | 5× POST /contribute (parallel) | All recorded, no duplicate/lost, total correct | API, DB |
| TC-289 | Concurrent login attempts — same user, 5 parallel | 5× POST /login | All succeed or rate limited — no deadlock | API |
| TC-290 | Concurrent sale finalization | 2× POST /finalize (parallel) | Exactly one succeeds, one fails | API, DB |
| TC-291 | Concurrent claim attempts | 2× POST /claim (parallel) | Exactly one succeeds | API, DB |
| TC-292 | Concurrent wallet linking — same wallet, 2 users | 2× POST /wallets/ (parallel) | Exactly one succeeds | API, DB |

---

## Execution Plan

| Phase | Tests | Est. Time | Priority |
|---|---|---|---|
| Phase 1: Auth + RBAC | TC-001 → TC-060 | 45 min | P0 |
| Phase 2: Tokens + Sales | TC-061 → TC-120 | 60 min | P0 |
| Phase 3: KYC + Wallets | TC-121 → TC-155 | 30 min | P0 |
| Phase 4: Compliance + Admin | TC-162 → TC-215 | 45 min | P1 |
| Phase 5: Input Validation | TC-213 → TC-235 | 30 min | P0 |
| Phase 6: On-Chain | TC-235 → TC-260 | 45 min | P1 |
| Phase 7: UI/Browser | TC-260 → TC-290 | 45 min | P1 |
| Phase 8: Concurrency | TC-288 → TC-300 | 20 min | P2 |
| Portfolio + Notifications | TC-151 → TC-195 | 20 min | P1 |

**Total: ~300 test cases, ~6 hours estimated**

**Checkpoint Gates:** Every 10 tests, mandatory checkpoint report per drift protocol.

---

*Test plan generated for Cireta v2.0 — Base Sepolia deployment*
*QA Auditor: Zyda | Date: 2026-03-25*
