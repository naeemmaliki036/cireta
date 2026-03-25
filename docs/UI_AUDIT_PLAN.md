# Cireta Platform — Comprehensive UI Audit Test Plan

> **Goal:** Test every user-facing flow end-to-end through the UI, cross-checking every action against the backend (DB + blockchain). No happy paths only — every edge case, error state, and permission boundary is tested.

## Test Environment

| Component | URL | Notes |
|---|---|---|
| Launchpad (Investor UI) | http://localhost:3000 | Next.js app |
| Admin Panel | http://localhost:3001 | Next.js app |
| API | http://localhost:8000 | FastAPI |
| DB | cireta-db:5435 | PostgreSQL |
| Chain | Base Sepolia (84532) | Live testnet |

## Seed Data

| User | Email | Role | KYC Status | Password |
|---|---|---|---|---|
| Platform Admin | admin@cireta.io | admin | n/a | Admin123!@# |
| Issuer (GoldCorp) | issuer@goldcorp.io | issuer | n/a | Issuer123!@# |
| Alice (Investor) | alice@investor.io | investor | approved | Alice123!@# |
| Bob (Investor) | bob@investor.io | investor | none→pending | Bob123!@# |
| Charlie (Investor) | charlie@investor.io | investor | expired | Charlie123!@# |
| Eve (Blocked) | eve@blocked.io | investor | none | Eve123!@# |

---

## MODULE 1: AUTHENTICATION & REGISTRATION (Launchpad)

### 1.1 Registration
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| REG-1 | Register new investor | Fill form: email, password, confirm password, name | 201 → redirect to verify page | DB: new user row, role=investor, email_verified=false |
| REG-2 | Register with existing email | Use alice@investor.io | 409 error, "already registered" | DB: no duplicate row |
| REG-3 | Register weak password | Use "123" as password | 422 validation error | No DB write |
| REG-4 | Register mismatched passwords | password ≠ confirm_password | Client-side error | No API call |
| REG-5 | Register empty form | Submit blank form | Client-side validation errors | No API call |
| REG-6 | Register with SQL injection email | Use `'; DROP TABLE users;--@test.io` | 422 or sanitized | DB: no damage |
| REG-7 | Register with XSS in name | Use `<script>alert(1)</script>` | Sanitized or escaped in UI | DB: check stored value |

### 1.2 Login
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| LOGIN-1 | Valid login (investor) | alice@investor.io + correct password | 200 → dashboard | DB: failed_login_attempts=0 |
| LOGIN-2 | Valid login (issuer) | issuer@goldcorp.io + correct password | 200 → issuer dashboard | JWT role=issuer |
| LOGIN-3 | Valid login (admin) | admin@cireta.io + correct password | 200 → admin panel | JWT role=admin |
| LOGIN-4 | Wrong password | Correct email, wrong password | 401 "Invalid credentials" | DB: failed_login_attempts++ |
| LOGIN-5 | Unknown email | fake@nobody.io | 401 "Invalid credentials" (same msg!) | No info leakage |
| LOGIN-6 | Empty fields | Submit empty | Client validation | No API call |
| LOGIN-7 | Account lockout | 5+ wrong passwords rapidly | 429 or locked | DB: locked_until set |
| LOGIN-8 | Case sensitivity | ALICE@INVESTOR.IO | Should work (email lowercase) | Check DB normalization |
| LOGIN-9 | JWT expiry | Login, wait for token expiry, try action | 401 + redirect to login | Check refresh flow |
| LOGIN-10 | Logout | Click logout | Cookies cleared, redirect to login | Refresh token invalidated |

### 1.3 Password Reset
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| RESET-1 | Forgot password flow | Enter email → get 200 | "If email exists, link sent" | DB: password_reset_token set |
| RESET-2 | Reset with unknown email | Enter fake email | Same 200 response (no leakage) | No token set |
| RESET-3 | Reset with expired token | Use old/expired token | 400 "Token expired" | DB: token cleared |
| RESET-4 | Reset with valid token | Use valid token + new password | 200 → redirect to login | DB: password hash updated |

---

## MODULE 2: INVESTOR DASHBOARD (Launchpad)

### 2.1 Explore / Token Listing
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| EXPLORE-1 | View all tokens | Navigate to /explore | List of available tokens | API: GET /tokens returns all |
| EXPLORE-2 | Token detail page | Click a token | Full token info: name, symbol, description, issuer | API: GET /tokens/{id} |
| EXPLORE-3 | Token with no sale | View token without active sale | No "invest" button or greyed out | DB: no token_sales for token |
| EXPLORE-4 | Pagination | If >20 tokens, scroll/paginate | Correct pagination | API: page/size params |
| EXPLORE-5 | Search/filter | Search by name/symbol | Filtered results | API: query params |

### 2.2 KYC Flow
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| KYC-1 | View KYC status (approved) | Login as Alice | Badge shows "Approved" | DB: kyc_status=approved |
| KYC-2 | View KYC status (none) | Login as Bob | Prompt to start KYC | DB: kyc_status=none |
| KYC-3 | View KYC status (expired) | Login as Charlie | Badge shows "Expired", can re-verify | DB: kyc_status=expired |
| KYC-4 | Initiate KYC | Bob clicks "Start KYC" | Status changes to pending | DB: kyc_status=pending, kyc_application created |
| KYC-5 | Already pending | Bob tries to initiate again | 409 "KYC already in progress" | DB: no duplicate |
| KYC-6 | Unauthenticated KYC | Call API without token | 401 | No state change |

### 2.3 Portfolio
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| PORT-1 | Empty portfolio | New user, no investments | Empty state message | API: GET /portfolio/holdings → [] |
| PORT-2 | Holdings page | Alice with holdings | Token balances displayed | API: GET /portfolio/holdings |
| PORT-3 | Summary | Portfolio summary | Total value, allocation % | API: GET /portfolio/summary |
| PORT-4 | Vesting schedule | View vesting | Upcoming vest dates | API: GET /portfolio/vesting |
| PORT-5 | Transaction history | View transactions | List with dates, types | API: GET /portfolio/transactions |
| PORT-6 | Dividends | View dividends | Dividend history | API: GET /portfolio/dividends |
| PORT-7 | Redemptions | View redemptions | Redemption requests | API: GET /portfolio/redemptions |
| PORT-8 | Unauthenticated | Access /portfolio without login | Redirect to login | 401 from API |

### 2.4 Wallet Linking
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| WALLET-1 | List wallets | View wallet page | Empty or existing wallets | API: GET /wallets |
| WALLET-2 | Link wallet (no sig) | Try to link without signature | 422 validation error | No wallet created |
| WALLET-3 | Unauthenticated | Access wallet API | 401 | No state change |

### 2.5 Notifications
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| NOTIF-1 | List notifications | Click bell icon | Notification list | API: GET /notifications |
| NOTIF-2 | Unread count | Check badge count | Count matches unread | API: GET /notifications/unread-count |
| NOTIF-3 | Mark all read | Click "mark all read" | All notifications marked | API: POST /notifications/read-all |
| NOTIF-4 | Preferences | View/update preferences | Saved preferences | API: GET/PUT /notifications/preferences |

### 2.6 Investment Flow (CRITICAL)
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| INVEST-1 | Contribute (approved KYC) | Alice invests in active sale | Transaction recorded | DB: contribution row, amount matches |
| INVEST-2 | Contribute (no KYC) | Bob tries to invest | 403 "KYC required" | No contribution |
| INVEST-3 | Contribute (expired KYC) | Charlie tries to invest | 403 "KYC expired" | No contribution |
| INVEST-4 | Contribute without auth | Anonymous tries to invest | 401 | No contribution |
| INVEST-5 | Exceed hard cap | Invest more than hard cap allows | Error "exceeds hard cap" | No contribution over limit |
| INVEST-6 | Below minimum | Invest less than minimum | Error "below minimum" | No contribution |
| INVEST-7 | Sale not active | Invest in draft/paused sale | Error "sale not active" | No contribution |
| INVEST-8 | Claim tokens | After sale finalized success | Tokens transferred | DB: claimed_at set, on-chain transfer |
| INVEST-9 | Claim refund | After sale finalized failed | USDC refunded | DB: refunded flag, on-chain transfer |
| INVEST-10 | Nothing to claim | Claim with no contributions | 404 "nothing to claim" | No state change |

### 2.7 MFA Setup
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| MFA-1 | Setup MFA | Navigate to settings → enable MFA | QR code shown | DB: mfa_secret set |
| MFA-2 | Verify MFA (no code) | Submit without TOTP code | 422 | mfa_enabled still false |
| MFA-3 | Verify MFA (valid code) | Submit correct TOTP | MFA enabled | DB: mfa_enabled=true |
| MFA-4 | Login with MFA | Login → prompted for TOTP | Complete login flow | JWT issued only after TOTP |

### 2.8 Settings
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| SETTINGS-1 | View account info | Navigate to /settings | Name, email displayed | API: GET /auth/me |
| SETTINGS-2 | Update profile | Change display name | Name updated | DB: display_name updated |

---

## MODULE 3: ISSUER PANEL (Admin)

### 3.1 Authentication
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-AUTH-1 | Login as issuer | issuer@goldcorp.io | Issuer dashboard | JWT role=issuer |
| ISS-AUTH-2 | Access platform admin pages | Try /platform/settings | Redirect or 403 | Role check |
| ISS-AUTH-3 | Investor tries issuer pages | Login as alice, visit /issuer | Redirect or 403 | Role check |

### 3.2 Token Management
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-TOK-1 | Create token | Fill form: name, symbol, decimals, asset_type | 201 → token created | DB: new token row, issuer_id matches |
| ISS-TOK-2 | Create duplicate symbol | Same symbol as existing | 409 or validation error | No duplicate |
| ISS-TOK-3 | Create missing fields | Omit required fields | 422 | No DB write |
| ISS-TOK-4 | Deploy token | Click "Deploy" on token page | On-chain deployment | DB: contract_address set, identity_registry_address, compliance_address |
| ISS-TOK-5 | Deploy already deployed | Click Deploy again | 400 "already deployed" | No duplicate tx |
| ISS-TOK-6 | View token detail | Click token | Contract address, on-chain info | Matches DB + blockchain |
| ISS-TOK-7 | Pause token | Click Pause | Token paused | DB: is_paused=true, on-chain paused |
| ISS-TOK-8 | Unpause token | Click Unpause | Token unpaused | DB: is_paused=false |
| ISS-TOK-9 | Upload document | Upload PDF/file | Document attached to token | DB: token_documents row |
| ISS-TOK-10 | Upload without name | Upload without doc name | 422 | No document |

### 3.3 Sale Management
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-SALE-1 | Create sale | Fill: token, payment_token, soft/hard cap, phases | 201 → sale created | DB: token_sales row, sale_phases rows |
| ISS-SALE-2 | Create sale (no token) | Create without selecting token | 422 | No DB write |
| ISS-SALE-3 | Create sale (investor) | Login as investor, try to create | 403 | No DB write |
| ISS-SALE-4 | View sale detail | Click sale | Full sale info | DB matches displayed data |
| ISS-SALE-5 | View sale by slug | Navigate via slug URL | Same sale data | DB: slug lookup works |
| ISS-SALE-6 | Deploy sale | Click Deploy on sale page | On-chain deployment | DB: contract_address set |
| ISS-SALE-7 | On-chain status | After deploy, view on-chain tab | Status, totalRaised, phases | Blockchain data matches |
| ISS-SALE-8 | Finalize sale | Click Finalize | Status changes | DB: status=FinalizedSuccess or FinalizedFailed |
| ISS-SALE-9 | Finalize not active | Finalize a draft sale | 400 | No state change |
| ISS-SALE-10 | OTC allocate | Allocate tokens to address | Allocation recorded | DB: contributions row with is_otc |

### 3.4 Investor Management
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-INV-1 | List investors | View investors page | All investors shown | API: GET /admin/investors |
| ISS-INV-2 | Investor detail | Click investor | KYC status, contributions, wallet | DB: user details |
| ISS-INV-3 | Filter by KYC status | Filter approved/pending/none | Correct filtering | API: query params |

### 3.5 Compliance
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-COMP-1 | View audit logs | Compliance → Audit Logs | All compliance actions | API: GET /admin/compliance/audit-logs |
| ISS-COMP-2 | Freeze address | Enter address → Freeze | Address frozen | DB: frozen_addresses row + on-chain |
| ISS-COMP-3 | Freeze without data | Submit empty | 422 | No freeze |
| ISS-COMP-4 | Unfreeze address | Unfreeze a frozen address | Address unfrozen | DB: entry removed + on-chain |
| ISS-COMP-5 | Forced transfer | Admin moves tokens between addresses | Transfer executed | On-chain transfer |
| ISS-COMP-6 | Recovery logs | View recovery history | All recovery actions | API: GET /admin/compliance/recovery-logs |
| ISS-COMP-7 | Investor tries compliance | Login as alice, call compliance endpoints | 403 | No state change |

### 3.6 Withdrawals
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ISS-WD-1 | List withdrawals | Withdrawals page | Withdrawal history | API: GET /issuer/withdrawals |
| ISS-WD-2 | Investor tries | Login as investor | 403 | No data leak |

---

## MODULE 4: PLATFORM ADMIN PANEL

### 4.1 Issuer Management
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ADM-ISS-1 | List issuers | Platform → Issuers | All issuers shown | API: GET /admin/issuers |
| ADM-ISS-2 | Create issuer | Add new issuer | 201 | DB: issuer row created |
| ADM-ISS-3 | Revoke issuer | Revoke active issuer | Status → revoked | DB: status=revoked |
| ADM-ISS-4 | Activate issuer | Activate revoked issuer | Status → active | DB: status=active |
| ADM-ISS-5 | Update fee | Change issuer fee BPS | Fee updated | DB: fee_bps changed |
| ADM-ISS-6 | Investor tries | Login as alice, access admin endpoints | 403 | No data |
| ADM-ISS-7 | Issuer tries | Login as issuer, access platform admin | 403 | No data |

### 4.2 Platform Stats
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ADM-STAT-1 | Platform stats | View analytics/stats | Issuer count, sale count, total raised | API: correct aggregation |
| ADM-STAT-2 | Stats accuracy | Compare displayed stats to DB | Numbers match | DB: COUNT queries |

### 4.3 Platform Settings
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ADM-SET-1 | View settings | Platform → Settings | Current settings shown | API: GET /admin/settings |
| ADM-SET-2 | Update settings | Change a setting | Setting saved | DB: setting updated |

### 4.4 Operations
| # | Test Case | Steps | Expected | Backend Check |
|---|---|---|---|---|
| ADM-OPS-1 | List redemptions | Operations → Redemptions | All redemptions | API: GET /admin/operations/redemptions |
| ADM-OPS-2 | List webhooks | Operations → Webhooks | Webhook history | API: GET /admin/operations/webhooks |
| ADM-OPS-3 | List dividends | Operations → Dividends | Dividend history | API: GET /admin/operations/dividends |

---

## MODULE 5: RBAC / AUTHORIZATION MATRIX

| # | Actor | Action | Expected |
|---|---|---|---|
| RBAC-1 | Investor | Freeze address | 403 |
| RBAC-2 | Investor | View audit logs | 403 |
| RBAC-3 | Investor | List all investors | 403 |
| RBAC-4 | Investor | List all issuers | 403 |
| RBAC-5 | Investor | Platform settings | 403 |
| RBAC-6 | Investor | Create token | 403 |
| RBAC-7 | Investor | Create sale | 403 |
| RBAC-8 | Issuer | Platform settings | 403 |
| RBAC-9 | Issuer | List issuers (admin view) | 403 |
| RBAC-10 | Issuer | Manage users | 403 |
| RBAC-11 | Expired JWT | Any authenticated endpoint | 401 |
| RBAC-12 | Forged JWT | Fake token | 401 |
| RBAC-13 | Missing Authorization header | Any auth endpoint | 401 |

---

## MODULE 6: CROSS-CUTTING CONCERNS

### 6.1 Security
| # | Test Case | Steps | Expected |
|---|---|---|---|
| SEC-1 | CORS headers | Check response headers | Correct Access-Control-* headers |
| SEC-2 | CSRF protection | Verify CSRF tokens on state-changing requests | Protected |
| SEC-3 | Rate limiting (login) | Send 50+ login requests rapidly | 429 after limit |
| SEC-4 | Rate limiting (register) | Send 50+ registration requests | 429 after limit |
| SEC-5 | SQL injection in search | Try `' OR 1=1 --` in search fields | Parameterized query, no injection |
| SEC-6 | XSS in token name | Create token with `<script>` in name | Escaped in UI |
| SEC-7 | Path traversal | Try `../../etc/passwd` in file upload | Rejected |
| SEC-8 | Missing auth on protected routes | Hit every /api/v1/ route without token | 401 on all protected routes |
| SEC-9 | Content-Type validation | Send non-JSON body | 422 |
| SEC-10 | Large payload | Send 10MB JSON body | 413 or 422 |

### 6.2 Error Handling
| # | Test Case | Steps | Expected |
|---|---|---|---|
| ERR-1 | 404 page | Visit /nonexistent | Friendly 404 page |
| ERR-2 | API 404 | GET /api/v1/tokens/00000000-0000-0000-0000-000000000001 | JSON 404 |
| ERR-3 | Malformed UUID | GET /api/v1/tokens/not-a-uuid | 422 |
| ERR-4 | DB down | Stop PostgreSQL, hit API | 503 "Database unavailable" |
| ERR-5 | RPC down | Block RPC URL, try deploy | 500 with clear error message |

### 6.3 Data Integrity
| # | Test Case | Steps | Expected |
|---|---|---|---|
| DATA-1 | Token contract matches DB | After deploy, compare contract_address | DB = on-chain |
| DATA-2 | Sale contract matches DB | After sale deploy | DB = on-chain |
| DATA-3 | Identity registry saved | After token deploy | identity_registry_address in DB |
| DATA-4 | Compliance address saved | After token deploy | compliance_address in DB |
| DATA-5 | On-chain status vs DB | Read on-chain status | Matches sale record |
| DATA-6 | Contribution amounts | After contribution | DB amount = on-chain amount |
| DATA-7 | Fee calculation | Check platform fee | feeBasisPoints * amount / 10000 |

---

## MODULE 7: UI/UX QUALITY

| # | Test Case | Steps | Expected |
|---|---|---|---|
| UX-1 | Responsive design | Test at 375px, 768px, 1440px widths | No broken layouts |
| UX-2 | Loading states | Slow network (throttle) | Spinners/skeletons shown |
| UX-3 | Empty states | No data scenarios | Helpful empty state messages |
| UX-4 | Form validation feedback | Submit invalid forms | Clear error messages per field |
| UX-5 | Navigation consistency | Click through all nav links | No broken links, correct active states |
| UX-6 | Cookie/session persistence | Refresh page after login | Stay logged in |
| UX-7 | Breadcrumbs | Deep pages | Correct breadcrumb trail |
| UX-8 | Logout redirect | Logout from any page | Redirect to login, no back-button access |

---

## Execution Plan

### Phase 1: Setup & Seed Data
1. Reset DB to clean state
2. Verify all seed users exist
3. Start Launchpad (port 3000), Admin (port 3001), API (port 8000)
4. Take screenshots of starting state

### Phase 2: Auth & Registration (Browser automation)
- Run all REG-*, LOGIN-*, RESET-* tests
- Cross-check DB state after each

### Phase 3: Issuer Flows (Admin Panel)
- Login as issuer → create token → deploy → create sale → deploy sale
- Verify every step against DB and blockchain

### Phase 4: Investor Flows (Launchpad)
- Login as each investor role (approved, pending, expired, none)
- Test KYC, explore, invest, portfolio, notifications, wallet

### Phase 5: Platform Admin Flows
- Login as admin → manage issuers, view stats, compliance
- Verify RBAC boundaries

### Phase 6: Security & Edge Cases
- Run all SEC-*, ERR-*, DATA-* tests
- Automated where possible, manual where needed

### Phase 7: Report
- Screenshot every failure
- Log every DB/API response discrepancy
- Create issue list with severity (Critical/High/Medium/Low)

---

**Total test cases: ~130+**
**Estimated execution time: 2-3 hours (with browser automation)**

> Awaiting Jawad's review before execution.
