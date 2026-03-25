# Cireta QA Audit — Full Test Plan (Expanded)

**Date:** 2026-03-25
**Auditor:** Zyda (OpenClaw AI QA)
**Target:** Cireta RWA Tokenization Launchpad
**Scope:** Full-stack destructive testing — API, UI, DB, On-Chain
**Version:** 2.0 — Expanded from 187 → 270 test cases

---

## Test Data Baseline

| Entity | Details |
|---|---|
| **Admin** | admin@cireta.io / role=admin |
| **Issuer** | issuer@goldcorp.io / role=issuer |
| **Alice (KYC'd investor)** | alice@investor.io / kyc_status=approved, kyc_level=1 |
| **Bob (pending KYC)** | bob@investor.io / kyc_status=pending |
| **Charlie (no KYC)** | charlie@investor.io / kyc_status=not_started |
| **Eve (blocked)** | eve@blocked.io / kyc_status=not_started |
| **Token** | Test Gold Token (TGLD) — deployed on Base Sepolia, contract_address set |
| **Sale** | 1 sale linked to TGLD |
| **Contracts** | 13 deployed on Base Sepolia (see deployments/base-sepolia.json) |
| **Password policy** | Min 8 chars, 1 upper, 1 lower, 1 digit, 1 special char |
| **Rate limits** | Login: 5/min (prod) / 50/min (test), Register: 10/min, Default: 100/min |

### Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| IdentityRegistryStorage | 0xFEe7c667db9b54767A8772dcBC81a9d177C0954E |
| ClaimTopicsRegistry | 0xc2A8F6ef64B375872dBf09BD3Eb650a620687F02 |
| TrustedIssuersRegistry | 0xA695Dd3a5bc6c34BC914a650fAa46596e2E03319 |
| IssuerRegistry | 0x3bdE32b8AC48d8015e34E2335B5a640072105225 |
| PlatformFeeManager | 0x545Ce9dc34E3086B505D9fd8DB443906E2c796f6 |
| TokenImplementation | 0x35e6CD52b56642A7f1f172e29e6fEa3b9d9473Bc |
| IdentityRegistryImpl | 0x921905f38a3af1C35638f2fAA97B41EA4d7f300c |
| ComplianceImpl | 0xcD84cad8615664472cbFCCa3dAFFC3270c423039 |
| TokenFactory | 0x6918cE85Da96C07Deaeba796512422ab8AEEB99D |
| SaleFactory | 0xe4a06Eaa949D12B173B0bA5f7CaABe473b4e8b5F |
| CountryAllowModule | 0xce620bd7213ed4b56D5AEFc445C3da95C4C7bd24 |
| MaxHolderCountModule | 0xC21EA2D0f85b25D29e2f9e971d5F76a54986c585 |
| SaleImplementation | 0x33f4CA4E9C18c22A179a258082D03A94f1B7d53a |

---

## Category 1: Auth & Session Management

### Subcategory 1A: Registration

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-001 | Register with valid credentials | No existing account for email | 1. POST /api/v1/auth/register with {email: "newuser@test.io", password: "Test1234!", display_name: "New User"} | 201 Created. DB: users row with email_verified=false, role=investor, hashed_password != plaintext. Response: access_token + token_type. | P0 | API, DB | Both |
| TC-002 | Register with duplicate email | admin@cireta.io exists | 1. POST /api/v1/auth/register with {email: "admin@cireta.io", password: "Test1234!"} | 409 Conflict. DB: No duplicate row. Response: error message about existing email. | P1 | API, DB | Both |
| TC-003 | Register — password too short (7 chars) | None | 1. POST /api/v1/auth/register with {email: "short@test.io", password: "Te1!abc"} | 422 Validation Error. Body must reference password complexity. DB: No row created. | P1 | API, DB | Both |
| TC-004 | Register — password no uppercase | None | 1. POST /api/v1/auth/register with {email: "noup@test.io", password: "test1234!"} | 422 Validation Error. | P1 | API | Both |
| TC-005 | Register — password no lowercase | None | 1. POST /api/v1/auth/register with {email: "nolow@test.io", password: "TEST1234!"} | 422 Validation Error. | P1 | API | Both |
| TC-006 | Register — password no digit | None | 1. POST /api/v1/auth/register with {email: "nodig@test.io", password: "Testtest!"} | 422 Validation Error. | P1 | API | Both |
| TC-007 | Register — password no special char | None | 1. POST /api/v1/auth/register with {email: "nospec@test.io", password: "Test12345"} | 422 Validation Error. | P1 | API | Both |
| TC-008 | Register — empty body | None | 1. POST /api/v1/auth/register with {} | 422. No DB row. | P2 | API | Both |
| TC-009 | Register — SQL injection in email | None | 1. POST /api/v1/auth/register with {email: "test@x.io'; DROP TABLE users;--", password: "Test1234!"} | 422 (invalid email format). DB: users table intact, no rows dropped. | P0 | API, DB | Local |
| TC-010 | Register — XSS in display_name | None | 1. POST /api/v1/auth/register with {email: "xss@test.io", password: "Test1234!", display_name: "<script>alert(1)</script>"} | Either: 422 reject OR 201 but display_name stored escaped/sanitized. Admin panel MUST NOT render raw script tag. | P0 | API, DB, UI | Local |
| TC-011 | Register — email with max length | None | 1. POST /api/v1/auth/register with email of 255+ chars | 422 Validation Error. | P3 | API | Both |

### Subcategory 1B: Login & JWT

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-012 | Login with valid credentials | admin@cireta.io exists | 1. POST /api/v1/auth/login with {email: "admin@cireta.io", password: "admin123!A"} | 200. Response: access_token (JWT, exp ~15min), refresh token set as httpOnly cookie. | P0 | API | Both |
| TC-013 | Login with wrong password | admin@cireta.io exists | 1. POST /api/v1/auth/login with {email: "admin@cireta.io", password: "wrongpassword"} | 401 Unauthorized. No token issued. DB: failed_login_attempts incremented. | P0 | API, DB | Both |
| TC-014 | Login with nonexistent email | No such user | 1. POST /api/v1/auth/login with {email: "nobody@nowhere.io", password: "Test1234!"} | 401. No timing difference from TC-013 (constant-time comparison). | P1 | API | Both |
| TC-015 | Login — empty body | None | 1. POST /api/v1/auth/login with {} | 422 Validation Error. | P2 | API | Both |
| TC-016 | JWT access token expiry verification | Valid login | 1. Login → get access_token. 2. Decode JWT, verify exp claim is ~15 min from now. 3. Verify token works on /auth/me. | JWT exp within 14-16 min window. /auth/me returns 200 with user data. | P1 | API | Both |
| TC-017 | JWT tampering — modify payload | Valid login | 1. Login → get access_token. 2. Decode JWT, change role from "investor" to "admin". 3. Re-encode (no re-sign). 4. GET /api/v1/auth/me with tampered token. | 401 Unauthorized — signature verification failure. | P0 | API | Both |
| TC-018 | JWT tampering — resign with wrong key | Valid login | 1. Login → get access_token. 2. Decode, re-sign with "fakesecret". 3. GET /api/v1/auth/me. | 401 Unauthorized. | P0 | API | Both |
| TC-019 | Expired access token on protected endpoint | Valid login | 1. Login. 2. Wait for or craft expired JWT (exp in past). 3. GET /api/v1/auth/me. | 401 Unauthorized — token expired. | P0 | API | Both |
| TC-020 | Access protected route with no token | None | 1. GET /api/v1/auth/me with no Authorization header. | 401 Unauthorized. | P0 | API | Both |
| TC-021 | Access with garbage token | None | 1. GET /api/v1/auth/me with Authorization: Bearer garbage123. | 401 Unauthorized. | P1 | API | Both |

### Subcategory 1C: Token Refresh & Logout

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-022 | Refresh token rotation | Valid login with refresh cookie | 1. Login → save refresh cookie. 2. POST /api/v1/auth/refresh with cookie. 3. Verify new access_token returned + new refresh cookie set. | 200. New access_token with fresh expiry. New refresh cookie. | P0 | API | Both |
| TC-023 | Use old refresh token after rotation | TC-022 completed | 1. After refresh in TC-022, use the OLD refresh cookie. 2. POST /api/v1/auth/refresh. | 401 — old refresh token rejected (single-use). | P0 | API | Both |
| TC-024 | Logout invalidates access token | Valid login | 1. Login → get tokens. 2. POST /api/v1/auth/logout. 3. GET /api/v1/auth/me with the old access_token. | Logout returns 200. Subsequent /auth/me returns 401 (token blacklisted in Redis). Redis: blacklist key exists with TTL matching token expiry. | P0 | API, DB (Redis) | Both |
| TC-025 | Refresh after logout | Valid login | 1. Login. 2. Logout. 3. Try POST /api/v1/auth/refresh. | 401 — refresh token invalidated. | P1 | API | Both |

### Subcategory 1D: MFA (TOTP)

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-026 | MFA setup — generate secret + QR | Logged in as alice | 1. POST /api/v1/auth/mfa/setup. | 200. Response: secret (base32), qr_code (otpauth:// URI), backup_codes (array of 8-10 codes). DB: mfa_secret set, mfa_enabled=false still. | P1 | API, DB | Both |
| TC-027 | MFA enable with valid TOTP code | TC-026 done | 1. Generate TOTP code from secret. 2. POST /api/v1/auth/mfa/enable with {code: "<valid_totp>"}. | 200. DB: mfa_enabled=true. | P1 | API, DB | Both |
| TC-028 | MFA enable with invalid code | TC-026 done, MFA not yet enabled | 1. POST /api/v1/auth/mfa/enable with {code: "000000"}. | 400/401. DB: mfa_enabled still false. | P1 | API, DB | Both |
| TC-029 | Login with MFA — valid TOTP | MFA enabled for user | 1. POST /api/v1/auth/login → should return partial JWT or require MFA step. 2. POST /api/v1/auth/mfa/verify with valid TOTP. | Full JWT issued after TOTP verification. | P0 | API | Both |
| TC-030 | Login with MFA — invalid TOTP | MFA enabled for user | 1. Login → MFA prompt. 2. POST /api/v1/auth/mfa/verify with wrong code. | Rejected. No full JWT issued. | P0 | API | Both |
| TC-031 | Login with MFA — backup code | MFA enabled, backup codes from TC-026 | 1. Login → MFA prompt. 2. POST /api/v1/auth/mfa/verify with backup_code (first from list). | Full JWT issued. Backup code consumed. | P1 | API, DB | Both |
| TC-032 | Backup code is single-use | TC-031 completed | 1. Logout. 2. Login again → MFA prompt. 3. Use SAME backup code as TC-031. | Rejected — backup code already consumed. | P1 | API, DB | Both |
| TC-033 | MFA disable | MFA enabled for user | 1. POST /api/v1/auth/mfa/disable with valid TOTP or password. | 200. DB: mfa_enabled=false, mfa_secret cleared. | P2 | API, DB | Both |

### Subcategory 1E: Password Reset

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-034 | Forgot password — valid email | alice@investor.io exists | 1. POST /api/v1/auth/forgot-password with {email: "alice@investor.io"}. | 200 (always — no email enumeration). DB: password_reset_token set, password_reset_expires set (~1hr from now). | P1 | API, DB | Both |
| TC-035 | Forgot password — unknown email | No such user | 1. POST /api/v1/auth/forgot-password with {email: "nobody@x.io"}. | 200 (same response — no enumeration). DB: No new rows/tokens. | P1 | API, DB | Both |
| TC-036 | Reset password with valid token | TC-034 done, have reset token from DB | 1. POST /api/v1/auth/reset-password with {token: "<from_db>", new_password: "NewPass1!"}. | 200. DB: hashed_password changed, password_reset_token cleared. | P0 | API, DB | Both |
| TC-037 | Reset password — reuse token | TC-036 done | 1. POST /api/v1/auth/reset-password with same token again. | 400/401 — token already consumed. DB: No password change. | P0 | API, DB | Both |
| TC-038 | Reset password — expired token | Token with past expiry | 1. Manually set password_reset_expires to past in DB. 2. POST /api/v1/auth/reset-password. | 400/401 — token expired. | P1 | API, DB | Local |
| TC-039 | Reset password — weak new password | Valid reset token | 1. POST /api/v1/auth/reset-password with {token: "<valid>", new_password: "weak"}. | 422 — password complexity. DB: password unchanged. | P1 | API, DB | Both |

### Subcategory 1F: Rate Limiting

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-040 | Login rate limit — exceed threshold | Rate limit configured | 1. Send 51 login requests in <60s (wrong password). | First 50: 401. 51st: 429 Too Many Requests. Response includes Retry-After or X-RateLimit headers. | P0 | API | Local |
| TC-041 | Register rate limit | Rate limit configured | 1. Send 11 register requests in <60s. | 11th: 429. | P1 | API | Local |
| TC-042 | Rate limit resets after window | TC-040 done | 1. Wait 60s. 2. Try login again. | 401 (not 429) — rate limit reset. | P2 | API | Local |

### Subcategory 1G: Brute Force & Lockout

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-043 | Account lockout after 5 failed logins | alice exists, failed_login_attempts=0 | 1. Send 5 login requests with wrong password. 2. Send 6th with CORRECT password. | After 5 fails: DB failed_login_attempts=5, locked_until set (~15min). 6th attempt (correct pw): still locked out. | P0 | API, DB | Both |
| TC-044 | Lockout expires | TC-043, locked_until in past | 1. Manually set locked_until to past. 2. Login with correct password. | 200 — login succeeds. DB: failed_login_attempts reset to 0. | P1 | API, DB | Local |

---

## Category 2: KYC & On-Chain Identity

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-045 | Initiate KYC — valid user | Logged in as bob (no KYC) | 1. POST /api/v1/kyc/initiate. | 200. Response includes Sumsub access token or SDK URL. DB: kyc_status may update to "pending" or remain. | P0 | API, DB | Both |
| TC-046 | KYC status check — not initiated | Logged in as charlie (not_started) | 1. GET /api/v1/kyc/status. | 200. Response: {status: "not_started", level: 0}. | P2 | API | Both |
| TC-047 | KYC status check — approved user | Logged in as alice (approved) | 1. GET /api/v1/kyc/status. | 200. Response: {status: "approved", level: 1}. Matches DB. | P1 | API, DB | Both |
| TC-048 | KYC initiate without auth | Not logged in | 1. POST /api/v1/kyc/initiate with no token. | 401 Unauthorized. | P0 | API | Both |
| TC-049 | KYC duplicate initiation | Alice already approved | 1. Login as alice. 2. POST /api/v1/kyc/initiate. | 409 or appropriate error — already completed. | P2 | API | Both |
| TC-050 | Sumsub webhook — valid approval | Webhook secret configured | 1. POST /api/v1/kyc/webhook with valid HMAC signature, body: {type: "applicantReviewed", reviewResult: {reviewAnswer: "GREEN"}, externalUserId: "<bob_id>"}. | 200. DB: bob.kyc_status=approved, kyc_level=1, kyc_verified_at set. webhook_events table: row with status=processed. | P0 | API, DB | Local |
| TC-051 | Sumsub webhook — rejection | Webhook secret configured | 1. POST /api/v1/kyc/webhook with valid HMAC, body with reviewAnswer: "RED". | 200 (webhook accepted). DB: kyc_status=rejected. No ONCHAINID deployment. | P1 | API, DB | Local |
| TC-052 | Sumsub webhook — tampered signature | None | 1. POST /api/v1/kyc/webhook with wrong X-Payload-Digest header. | 401/403 — signature validation failed. DB: No kyc_status change. | P0 | API, DB | Local |
| TC-053 | Sumsub webhook — replay (same payload twice) | TC-050 done | 1. Resend exact same webhook from TC-050. | Idempotent: 200. DB: No duplicate processing. Status still approved. | P1 | API, DB | Local |
| TC-054 | webhook_events table — retry mechanics | None | 1. After TC-050, query webhook_events table. | Row exists: provider=sumsub, status=processed, attempts=1, processed_at set. | P2 | DB | Local |
| TC-055 | Corporate KYB initiation | Logged in, no KYC | 1. POST /api/v1/kyc/corporate/initiate. | 200. Response: access token for corporate flow. | P2 | API | Both |
| TC-056 | On-chain identity verification (post-KYC) | User with approved KYC + ONCHAINID deployed | 1. Check if user.onchain_id is set in DB. 2. Call IdentityRegistryStorage on-chain: isVerified(wallet). | DB has onchain_id address. On-chain: isVerified returns true for the wallet. | P0 | DB, Chain | Local |

---

## Category 3: Wallet Integration & SIWE

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-057 | List wallets — empty | Logged in as charlie (no wallets) | 1. GET /api/v1/wallets/. | 200. Empty array. | P2 | API | Both |
| TC-058 | Link wallet — missing signature | Logged in | 1. POST /api/v1/wallets/link with {address: "0x1234..."} (no signature/message fields). | 422 Validation Error. | P1 | API | Both |
| TC-059 | Link wallet — no auth | Not logged in | 1. POST /api/v1/wallets/link. | 401. | P1 | API | Both |
| TC-060 | List wallets — with auth | Logged in as alice (may have wallets) | 1. GET /api/v1/wallets/. | 200. Array of wallet objects (may be empty). | P2 | API | Both |
| TC-061 | Unlink wallet — nonexistent | Logged in | 1. DELETE /api/v1/wallets/<random_uuid>. | 404. | P2 | API | Both |
| TC-062 | Set primary wallet — no wallets | Logged in, no wallets linked | 1. PATCH /api/v1/wallets/<random_uuid>/primary. | 404. | P2 | API | Both |
| TC-063 | Link wallet already linked to another account | Wallet linked to alice | 1. Login as bob. 2. POST /api/v1/wallets/link with alice's wallet address (with forged signature). | Should reject — either signature fails or "wallet already linked" error. | P1 | API, DB | Local |
| TC-064 | Wallet screening — no provider configured | Default state | 1. Check WalletScreeningProvider behavior. 2. Link wallet → does screening run? | If no provider: should either skip silently (log warning) or return default "pass". Must NOT block users when no provider configured. Document actual behavior. | P1 | API | Local |

---

## Category 4: Token Creation & Deployment

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-065 | List tokens — returns TGLD | None (public or authed) | 1. GET /api/v1/tokens/. | 200. Array containing TGLD token with name, symbol, contract_address, status. | P2 | API | Both |
| TC-066 | Create token — valid (issuer) | Logged in as issuer | 1. POST /api/v1/tokens/ with {name: "Silver Token", symbol: "SILV", total_supply: 100000, asset_type: "commodity"}. | 201. DB: token row with status=draft, no contract_address yet. Response: token id + slug generated. | P0 | API, DB | Both |
| TC-067 | Create token — as investor (forbidden) | Logged in as alice (investor) | 1. POST /api/v1/tokens/ with valid token data. | 403 Forbidden. | P0 | API | Both |
| TC-068 | Create token — missing required fields | Logged in as issuer | 1. POST /api/v1/tokens/ with {name: "X"} (missing symbol). | 422. | P1 | API | Both |
| TC-069 | Get token by ID | TGLD exists | 1. GET /api/v1/tokens/<tgld_id>. | 200. Full token data including contract_address. | P2 | API | Both |
| TC-070 | Get nonexistent token | None | 1. GET /api/v1/tokens/00000000-0000-0000-0000-000000000001. | 404. | P2 | API | Both |
| TC-071 | Deploy token on-chain | Token in draft status, issuer logged in | 1. POST /api/v1/tokens/<id>/deploy. 2. Wait for tx confirmation. | 200. DB: contract_address set. Chain: CiretaTREXFactory emitted event, token contract exists at address. | P0 | API, DB, Chain | Local |
| TC-072 | Deploy already-deployed token | TGLD already deployed | 1. POST /api/v1/tokens/<tgld_id>/deploy. | 400 — already deployed. DB: contract_address unchanged. | P1 | API, DB | Both |
| TC-073 | Proof of reserve | TGLD exists | 1. GET /api/v1/tokens/<tgld_id>/proof-of-reserve. | 200. Response includes PoR data (or empty/unavailable if no Chainlink feed configured). | P2 | API | Both |
| TC-074 | Upload document — no name (invalid) | Logged in as issuer, TGLD exists | 1. POST /api/v1/tokens/<tgld_id>/documents with no name field. | 422. | P2 | API | Both |
| TC-075 | List documents | TGLD exists | 1. GET /api/v1/tokens/<tgld_id>/documents. | 200. Array (may be empty). | P3 | API | Both |
| TC-076 | Token slug generation | Create token | 1. Create token with name "My Gold Token 2026". | Slug generated: "my-gold-token-2026" or similar. DB: slug is unique and URL-safe. | P2 | API, DB | Both |

---

## Category 4B: Token Boundary Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-188 | Create token with 0 total supply | Logged in as issuer | 1. POST /api/v1/tokens/ with {name: "Zero Supply", symbol: "ZERO", total_supply: 0, asset_type: "commodity"}. | 422 Validation Error — total_supply must be > 0. DB: No token row created. | P1 | API, DB | Both |
| TC-189 | Create token with max uint256 total supply | Logged in as issuer | 1. POST /api/v1/tokens/ with total_supply = 2^256-1 (115792089237316195423570985008687907853269984665640564039457584007913129639935). | Either: 422 (exceeds sane limit) OR 201 but deploy step must handle on-chain uint256 max. Verify DB stores value without overflow. | P1 | API, DB, Chain | Local |
| TC-190 | Create token with 0 decimals | Logged in as issuer | 1. POST /api/v1/tokens/ with {name: "No Decimal", symbol: "NDC", total_supply: 1000, decimals: 0}. 2. Deploy on-chain. 3. Verify on-chain decimals() returns 0. | Token created and deployed. On-chain decimals() == 0. Contribution math uses 0 decimals correctly. | P1 | API, DB, Chain | Local |
| TC-191 | Create token with 18 decimals | Logged in as issuer | 1. POST /api/v1/tokens/ with decimals: 18. 2. Deploy on-chain. 3. Verify on-chain decimals() returns 18. | Token created and deployed. On-chain decimals() == 18. Verify contribution token amount math handles 18 decimals (USDC is 6). | P1 | API, DB, Chain | Local |
| TC-192 | Token name with Unicode/emoji | Logged in as issuer | 1. POST /api/v1/tokens/ with {name: "Gold 🥇 Token", symbol: "G🥇T"}. 2. If 201, deploy on-chain. | Either: 422 (invalid chars for on-chain name) OR 201 + deploy succeeds. Verify on-chain name() matches. Slug generation handles emoji gracefully. | P2 | API, DB, Chain | Local |
| TC-193 | UUPS proxy admin verification | Token deployed on-chain | 1. Using cast, call the token proxy's admin slot (EIP-1967: storage slot 0xb53127...). 2. Verify the admin is the expected deployer/factory. 3. Attempt upgradeTo() from non-admin → must revert. | Admin slot returns expected address. Non-admin upgradeTo() reverts with "NOT_AUTHORIZED" or similar. | P0 | Chain | Local |

---

## Category 5: Sale Lifecycle

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-077 | List sales | None | 1. GET /api/v1/sales/. | 200. Array of sales with status, phases, caps. | P2 | API | Both |
| TC-078 | Create sale — valid | Logged in as issuer, TGLD deployed | 1. POST /api/v1/sales/ with {token_id, payment_token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" (USDC Base Sepolia), soft_cap: "1000", hard_cap: "5000", phases: [{name: "Public", allocation: 100, price_per_token: "2", start_time: future, end_time: future+30d}]}. | 201. DB: token_sales row, phases stored. | P0 | API, DB | Both |
| TC-079 | Create sale — as investor (forbidden) | Logged in as alice | 1. POST /api/v1/sales/ with valid data. | 403. | P0 | API | Both |
| TC-080 | Get sale by ID | Sale exists | 1. GET /api/v1/sales/<sale_id>. | 200. Full sale data with phases, status, caps, total_raised. | P2 | API | Both |
| TC-081 | Get sale by slug | Sale with slug exists | 1. GET /api/v1/sales/by-slug/<slug>. | 200. Same data as by ID. | P2 | API | Both |
| TC-082 | Get nonexistent sale | None | 1. GET /api/v1/sales/00000000-0000-0000-0000-000000000001. | 404. | P2 | API | Both |
| TC-083 | Deploy sale on-chain | Sale in draft, token deployed | 1. POST /api/v1/sales/<id>/deploy with {identity_registry, fee_basis_points}. 2. Wait for tx. | 200. DB: sale_contract_address or on_chain_address set. Chain: Sale contract deployed, initialize() called. | P0 | API, DB, Chain | Local |
| TC-084 | Deploy sale — token not deployed | Sale for undeployed token | 1. Create token (no deploy). 2. Create sale. 3. Deploy sale. | 400 — token must be deployed first. | P0 | API | Both |
| TC-085 | On-chain sale status | Deployed sale | 1. GET /api/v1/sales/<id>/on-chain. | 200. Response: {status, totalRaised, phases: [...]}. Data matches on-chain contract state. | P1 | API, Chain | Local |
| TC-086 | Contribute — no auth | Sale active | 1. POST /api/v1/sales/<id>/contribute with no token. | 401. | P0 | API | Both |
| TC-087 | Contribute — no KYC | Logged in as charlie (no KYC) | 1. POST /api/v1/sales/<id>/contribute with {amount: "100", tx_hash: "0x..."}. | 403 — KYC required. | P0 | API | Both |
| TC-088 | Contribute — valid (KYC'd user) | Logged in as alice (KYC approved), sale active | 1. POST /api/v1/sales/<id>/contribute with {amount: "100", tx_hash: "0x<real_tx_hash>"}. | 200/201. DB: contributions row with user_id, amount, tx_hash, status. | P0 | API, DB | Local |
| TC-089 | Finalize sale — not active | Sale in draft status | 1. POST /api/v1/sales/<id>/finalize. | 400 — sale not active or already finalized. | P1 | API | Both |
| TC-090 | Claim tokens — no contribution | Logged in, no contributions for this sale | 1. POST /api/v1/sales/<id>/claim. | 404 — no contribution found. | P1 | API | Both |
| TC-091 | Claim refund — sale not failed | Sale active or successful | 1. POST /api/v1/sales/<id>/refund. | 400 — refund only available for failed sales. | P1 | API | Both |
| TC-092 | OTC allocate — valid | Logged in as issuer | 1. POST /api/v1/sales/<id>/otc with {wallet_address: "0x...", amount: "500"}. | 200. DB: contribution row with source=otc. | P1 | API, DB | Both |
| TC-093 | Contribute with duplicate tx_hash | Same tx_hash as TC-088 | 1. POST /api/v1/sales/<id>/contribute with same tx_hash. | 400/409 — duplicate transaction. | P0 | API, DB | Both |
| TC-094 | Contribute below phase minimum | Phase with min_contribution set | 1. Contribute with amount below min. | 400 — below minimum contribution. | P1 | API | Both |
| TC-095 | Contribute above phase maximum | Phase with max_contribution set | 1. Contribute with amount above max. | 400 — exceeds maximum contribution. | P1 | API | Both |

---

## Category 5B: Sale Edge Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-194 | Overlapping phase dates | Logged in as issuer, token deployed | 1. POST /api/v1/sales/ with 2 phases: Phase 1 (Jan 1 – Jan 31) and Phase 2 (Jan 15 – Feb 15) — dates overlap. | Either: 422 rejecting overlapping dates OR 201 but only one phase active at any time. Verify behavior documented. If accepted, contribute during overlap period → verify which phase is selected. | P1 | API, DB | Both |
| TC-195 | Phase with 0 allocation | Logged in as issuer | 1. POST /api/v1/sales/ with phase allocation: 0. | 422 Validation Error — SalePhaseCreate schema requires allocation > 0 (Field gt=0). | P1 | API | Both |
| TC-196 | Phase min contribution > max contribution | Logged in as issuer | 1. POST /api/v1/sales/ with phase {min_contribution: "1000", max_contribution: "100"}. | 422 or 400 — min cannot exceed max. If API accepts, contribute with amount 500 → verify which limit applies. | P1 | API | Both |
| TC-197 | Phase price of 0 | Logged in as issuer | 1. POST /api/v1/sales/ with phase {price_per_token: "0"}. | 422 Validation Error — SalePhaseCreate schema requires price_per_token > 0 (Field gt=0). | P1 | API | Both |
| TC-198 | Phase dates in the past | Logged in as issuer | 1. POST /api/v1/sales/ with phase {start_time: "2020-01-01T00:00:00Z", end_time: "2020-02-01T00:00:00Z"}. | Either: 422 (past dates rejected) OR 201 but phase is never active. Verify no contribution possible if dates are past. | P1 | API | Both |
| TC-199 | Whitelist-only phase with empty whitelist | Logged in as issuer, sale deployed | 1. Create sale with phase {whitelist_only: true}. 2. Deploy sale. 3. Do NOT add any addresses to whitelist. 4. Alice tries to contribute. | 403/400 — not whitelisted. No one can contribute to empty whitelist phase. | P1 | API, Chain | Local |
| TC-200 | Soft cap > hard cap | Logged in as issuer | 1. POST /api/v1/sales/ with {soft_cap: "10000", hard_cap: "5000"}. | 422 or 400 — soft_cap must be ≤ hard_cap. DB: No sale created. | P0 | API | Both |
| TC-201 | Soft cap = 0 | Logged in as issuer | 1. POST /api/v1/sales/ with {soft_cap: "0", hard_cap: "5000"}. | Either: 422 (schema requires gt=0) OR 201. If accepted, finalize with any raised amount → verify sale succeeds (0 cap always met). | P1 | API, DB | Both |
| TC-202 | Multiple sales for same token | Logged in as issuer, TGLD has existing sale | 1. POST /api/v1/sales/ with same token_id as existing sale. | Either: 409 (one sale per token) OR 201 (multiple allowed). If allowed, verify total_raised is tracked per-sale not per-token. Document behavior. | P1 | API, DB | Both |

---

## Category 6: Portfolio & Investor Dashboard

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-096 | Get holdings — empty | Alice, no claimed tokens | 1. GET /api/v1/portfolio/holdings. | 200. Empty array. | P2 | API | Both |
| TC-097 | Get portfolio summary | Logged in as alice | 1. GET /api/v1/portfolio/summary. | 200. Summary object with total_value, holdings_count, etc. | P2 | API | Both |
| TC-098 | Get vesting schedules | Logged in | 1. GET /api/v1/portfolio/vesting. | 200. Array of vesting schedules (may be empty). | P2 | API | Both |
| TC-099 | Get transactions | Logged in | 1. GET /api/v1/portfolio/transactions. | 200. Transaction history. | P2 | API | Both |
| TC-100 | Get dividends | Logged in | 1. GET /api/v1/portfolio/dividends. | 200. Dividend data. | P2 | API | Both |
| TC-101 | Get redemptions | Logged in | 1. GET /api/v1/portfolio/redemptions. | 200. Redemption list. | P2 | API | Both |
| TC-102 | Portfolio — no auth | Not logged in | 1. GET /api/v1/portfolio/holdings without token. | 401. | P0 | API | Both |
| TC-103 | Create redemption request | Logged in, has holdings | 1. POST /api/v1/portfolio/redemptions with valid token_id and amount. | 200/201. DB: redemption row with status=pending. | P1 | API, DB | Both |
| TC-104 | Vault claimable amount | Logged in, vested sale | 1. GET /api/v1/portfolio/vesting/<sale_id>/claimable. | 200. Claimable amount based on vesting schedule. | P1 | API | Both |

---

## Category 6B: Vested Mode Investment

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-203 | Full vested contribution flow | Vested sale deployed, alice KYC'd, has USDC | 1. Alice approves USDC to sale contract. 2. Alice contributes 1000 USDC at $2/token → 500 tokens. 3. POST /api/v1/sales/<id>/contribute with tx_hash. 4. Verify on-chain: USDC transferred, fraction tokens minted to alice (NOT security tokens). | DB: contribution confirmed, tokens_allocated=500. Chain: CiretaVault holds security tokens. Alice receives fraction tokens representing her vested allocation. | P0 | API, DB, Chain | Local |
| TC-204 | CiretaVault holds security tokens | TC-203 completed, sale finalized | 1. Query CiretaVault contract: balanceOf(vault_address) on the security token. 2. Query alice's wallet: balanceOf(alice) on security token. | Vault holds security tokens equal to total allocated. Alice does NOT hold security tokens directly — only fraction tokens. | P0 | Chain | Local |
| TC-205 | Vesting schedule — cliff + linear | Vested sale finalized, alice has fraction tokens | 1. GET /api/v1/portfolio/vesting/<sale_id>/claimable immediately after finalization. 2. Verify cliff_duration and vesting_duration from response. | Claimable = 0 (cliff not passed). Response includes cliff_duration, vesting_duration, vesting_start_time. | P0 | API, Chain | Local |
| TC-206 | Claim before cliff → 0 or reject | Vested sale, cliff not passed | 1. POST /api/v1/portfolio/vesting/<schedule_id>/claim before cliff_end. | Either: 200 with claimed_amount=0 OR 400 "cliff not passed". No fraction tokens burned. No security tokens transferred. | P0 | API, Chain | Local |
| TC-207 | Claim partial vesting → pro-rata math | Vested sale, cliff passed, 50% vesting elapsed | 1. Advance time to 50% of vesting_duration past cliff. 2. GET claimable → verify ~50% of total. 3. POST claim. 4. Verify fraction tokens burned = claimed amount. 5. Verify security tokens transferred from vault to alice. | Claimed ~50% of total. Fraction tokens burned proportionally. Security tokens transferred from CiretaVault to alice's wallet. Remaining claimable reduced. | P0 | API, Chain | Local |
| TC-208 | Claim full vesting → all fractions burned | Vested sale, full vesting elapsed | 1. Advance time past vesting_end. 2. GET claimable → verify = total_amount - claimed_amount. 3. POST claim for remaining. 4. Verify all fraction tokens burned (balance = 0). 5. Verify all security tokens transferred from vault. | All fraction tokens burned. All security tokens now in alice's wallet. CiretaVault balance for this investor = 0. remaining_amount = 0. | P0 | API, Chain | Local |

---

## Category 6C: Phase Transitions

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-209 | Different token amounts per phase pricing | Sale with Phase 1 ($1.50/token) and Phase 2 ($2.00/token), both active at different times | 1. Contribute 1500 USDC in Phase 1 → expect 1000 tokens. 2. Contribute 2000 USDC in Phase 2 → expect 1000 tokens. 3. Verify DB: contributions[0].tokens_allocated = 1000, contributions[1].tokens_allocated = 1000. 4. Verify amounts match on-chain if deployed. | Phase 1: 1500 / 1.50 = 1000 tokens. Phase 2: 2000 / 2.00 = 1000 tokens. Different USDC amounts for same token count. DB and chain consistent. | P0 | API, DB, Chain | Local |
| TC-210 | Contribute at exact phase boundary timestamp | Sale with Phase 1 ending at T and Phase 2 starting at T | 1. Submit contribution with tx at exactly timestamp T. 2. Verify which phase the contribution is attributed to. | Contribution attributed to exactly one phase (no double-counting). Boundary handling is deterministic. | P1 | API, DB | Local |

---

## Category 7: Compliance & Admin Actions

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-105 | List audit logs | Logged in as admin | 1. GET /api/v1/admin/compliance/audit-logs. | 200. Array of compliance audit events. | P2 | API | Both |
| TC-106 | List frozen addresses | Logged in as admin | 1. GET /api/v1/admin/compliance/frozen. | 200. Array of frozen addresses (may be empty). | P2 | API | Both |
| TC-107 | List recovery logs | Logged in as admin | 1. GET /api/v1/admin/compliance/recovery-logs. | 200. | P2 | API | Both |
| TC-108 | Freeze address — no data | Logged in as admin | 1. POST /api/v1/admin/compliance/freeze with {}. | 422. | P1 | API | Both |
| TC-109 | Freeze address — as investor (RBAC) | Logged in as alice | 1. POST /api/v1/admin/compliance/freeze with valid data. | 403 Forbidden. | P0 | API | Both |
| TC-110 | Audit logs — as investor (RBAC) | Logged in as alice | 1. GET /api/v1/admin/compliance/audit-logs. | 403. | P0 | API | Both |
| TC-111 | Freeze address — valid | Logged in as issuer/admin, valid token + address | 1. POST /api/v1/admin/compliance/freeze with {token_id, wallet_address: "0x..."}. | 200. DB: audit log entry. Chain (if deployed): address frozen on-chain. | P0 | API, DB, Chain | Local |
| TC-112 | Unfreeze address | Previously frozen | 1. POST /api/v1/admin/compliance/unfreeze with same data. | 200. DB: audit log entry. Chain: address unfrozen. | P1 | API, DB, Chain | Local |
| TC-113 | Forced transfer | Logged in as admin/issuer | 1. POST /api/v1/admin/compliance/forced-transfer with {token_id, from_address, to_address, amount}. | 200. DB: audit log. Chain: tokens moved. | P0 | API, DB, Chain | Local |
| TC-114 | Pause token | Logged in as admin/issuer | 1. POST /api/v1/admin/compliance/pause with {token_id}. | 200. Chain: token paused, transfers blocked. | P1 | API, Chain | Local |
| TC-115 | Unpause token | TC-114 done | 1. POST /api/v1/admin/compliance/unpause with {token_id}. | 200. Chain: token unpaused. | P1 | API, Chain | Local |
| TC-116 | Recover tokens — from frozen address | Address frozen | 1. POST /api/v1/admin/compliance/recover with {token_id, from_address, to_address}. | 200. DB: recovery log. Chain: tokens recovered. | P1 | API, DB, Chain | Local |
| TC-117 | Compliance action without valid token_id | Logged in as admin | 1. Freeze with invalid token_id. | 404 or 422. | P2 | API | Both |

---

## Category 7B: Finalization Edge Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-211 | Successful sale — fee math (250 bps default) | Sale finalized successfully, total_raised = 10,000 USDC, fee_basis_points = 250 (default) | 1. POST /api/v1/sales/<id>/finalize. 2. Verify platform_fee_collected = 10000 * 250 / 10000 = 250 USDC. 3. Verify issuer receives 9750 USDC. 4. Check PlatformFeeManager on-chain balance. | Platform fee = 250 USDC (2.5%). Issuer net = 9750 USDC. On-chain: fee transferred to PlatformFeeManager. DB: platform_fee_collected matches. | P0 | API, DB, Chain | Local |
| TC-212 | Successful sale — custom issuer fee (500 bps) | Sale with fee_basis_points = 500, total_raised = 10,000 USDC | 1. Set issuer fee to 500 bps via admin. 2. Create + deploy + fund sale. 3. Finalize. 4. Verify fee = 500 USDC, issuer net = 9500 USDC. | Fee = 10000 * 500 / 10000 = 500 USDC. Math exact. | P1 | API, DB, Chain | Local |
| TC-213 | Failed sale — refund amount matches exactly | Sale failed (below soft cap), alice contributed 500 USDC | 1. Finalize sale (fails — below soft cap). 2. Alice calls POST /api/v1/sales/<id>/refund. 3. Verify refund amount = 500 USDC exactly (no fee deduction on failed sale). | Refund = full contribution amount (500 USDC). No fees charged. DB: contribution status = refunded. | P0 | API, DB, Chain | Local |
| TC-214 | Partial refund claim | Failed sale, alice has 2 contributions (200 + 300 USDC) | 1. Call refund once → verify both contributions refunded. 2. Check total refund = 500 USDC. | All contributions for user refunded in single call. Total matches sum of contributions. | P1 | API, DB | Local |
| TC-215 | Double refund attempt | TC-213 done, alice already refunded | 1. POST /api/v1/sales/<id>/refund again. | 400 — already refunded. No double USDC transfer. DB: contribution status unchanged. | P0 | API, DB, Chain | Local |
| TC-216 | Finalize before sale end date | Sale still active, end_time in future | 1. POST /api/v1/sales/<id>/finalize before end_time. | Either: 400 "sale still active" OR succeeds if hard cap reached. Document behavior — is early finalization allowed only when hard cap hit? | P1 | API | Both |
| TC-217 | Finalize already-finalized sale | Sale already finalized | 1. POST /api/v1/sales/<id>/finalize again. | 400 — already finalized. No state change. Idempotent or error. | P1 | API, DB | Both |
| TC-218 | Contribute after finalization | Sale finalized | 1. POST /api/v1/sales/<id>/contribute with valid data. | 400 — sale not active / already finalized. No contribution recorded. | P0 | API, DB | Both |

---

## Category 8: Admin — Issuer Management

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-118 | List issuers | Logged in as admin | 1. GET /api/v1/admin/issuers/. | 200. Array with issuer@goldcorp.io. | P2 | API | Both |
| TC-119 | List issuers — as investor (RBAC) | Logged in as alice | 1. GET /api/v1/admin/issuers/. | 403. | P0 | API | Both |
| TC-120 | Create issuer | Logged in as admin | 1. POST /api/v1/admin/issuers/ with {user_id: <charlie_id>, wallet_address: "0x...", company_name: "SilverCo"}. | 200/201. DB: issuers row, status=pending or active. | P1 | API, DB | Both |
| TC-121 | Update issuer fee | Logged in as admin | 1. PATCH /api/v1/admin/issuers/<id>/fee with {fee_basis_points: 300}. | 200. DB: fee_basis_points=300. | P2 | API, DB | Both |
| TC-122 | Revoke issuer | Logged in as admin | 1. POST /api/v1/admin/issuers/<id>/revoke. | 200. DB: issuer.status=revoked. | P1 | API, DB | Both |
| TC-123 | Activate issuer | TC-122 done (revoked issuer) | 1. POST /api/v1/admin/issuers/<id>/activate. | 200. DB: issuer.status=active. | P1 | API, DB | Both |
| TC-124 | Platform stats | Logged in as admin | 1. GET /api/v1/admin/platform/stats. | 200. JSON with total_users, total_issuers, active_sales, tvl_usdc, total_raised_usdc. All numeric. | P1 | API | Both |
| TC-125 | Platform settings — get | Logged in as admin | 1. GET /api/v1/admin/platform/settings. | 200. Settings object. | P2 | API | Both |
| TC-126 | Platform settings — update | Logged in as admin | 1. POST /api/v1/admin/platform/settings with {key: "maintenance_mode", value: "false"}. | 200. DB: platform_settings row updated. | P2 | API, DB | Both |
| TC-127 | Platform settings — as investor (RBAC) | Logged in as alice | 1. GET /api/v1/admin/platform/settings. | 403. | P0 | API | Both |
| TC-128 | Platform settings — as issuer (RBAC) | Logged in as issuer | 1. GET /api/v1/admin/platform/settings. | 403. | P0 | API | Both |

---

## Category 8B: Compliance Deep Tests

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-219 | Freeze → transfer reverts, portfolio view works | Alice holds 100 TGLD, issuer freezes alice's address | 1. POST freeze alice's address. 2. Alice attempts on-chain transfer → must revert. 3. GET /api/v1/portfolio/holdings as alice. | Transfer reverts with "address is frozen" or similar. Portfolio GET still returns 200 with alice's holdings (read-only view unaffected). | P0 | API, Chain | Local |
| TC-220 | Freeze address with no tokens | Address 0xDEAD... holds 0 tokens | 1. POST freeze 0xDEAD... for TGLD. | 200. Audit log created. Freeze recorded. When 0xDEAD receives tokens later, transfers from it should still be blocked. | P2 | API, DB, Chain | Local |
| TC-221 | Freeze already-frozen address (idempotent) | Alice already frozen | 1. POST freeze alice again with same token_id. | Either: 200 (idempotent, no error) OR 409 "already frozen". No duplicate freeze in audit log (or documented duplicate). Verify on-chain state unchanged. | P1 | API, DB, Chain | Local |
| TC-222 | Forced transfer to non-identity-registry address | Address 0xBEEF not registered in IdentityRegistry | 1. POST forced-transfer to 0xBEEF. | On-chain: revert — recipient not in identity registry. API: 400 or chain error propagated. No tokens moved. | P0 | API, Chain | Local |
| TC-223 | Forced transfer exceeding balance | Alice has 100 TGLD | 1. POST forced-transfer of 200 TGLD from alice. | On-chain: revert — insufficient balance. API: 400 or chain error. Alice still has 100. | P0 | API, Chain | Local |
| TC-224 | Pause → all transfers revert | Token paused | 1. Pause TGLD. 2. Alice attempts transfer → revert. 3. Try contribute to TGLD sale → verify behavior. 4. Try dividend claim → verify behavior. | All transfers revert. Contributions: either 400 (paused) or USDC accepted but token minting fails. Dividends: USDC claim may still work (dividends are USDC, not token transfers). Document exact behavior. | P0 | API, Chain | Local |
| TC-225 | Token recovery from frozen address | Alice frozen, holds 100 TGLD | 1. POST recover tokens from alice (100 TGLD) to treasury address. | 200. Chain: tokens moved from alice to treasury despite freeze. DB: recovery log created. Alice balance = 0. | P0 | API, DB, Chain | Local |
| TC-226 | Cross-issuer isolation | Issuer A owns Token A, Issuer B owns Token B | 1. Login as Issuer A. 2. POST freeze on Token B address. | 403 — Issuer A cannot act on Token B. Issuer B's tokens unaffected. | P0 | API | Both |
| TC-227 | Admin can act across issuers | Admin logged in, Token A and Token B exist | 1. POST freeze on Token A address → 200. 2. POST freeze on Token B address → 200. | Both succeed. Admin has cross-issuer authority. Audit logs show admin as actor. | P0 | API, DB | Both |

---

## Category 9: Admin Operations

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-129 | List redemptions (admin) | Logged in as admin | 1. GET /api/v1/admin/operations/redemptions. | 200. Array of all redemption requests. | P2 | API | Both |
| TC-130 | Update redemption status | Redemption exists | 1. PATCH /api/v1/admin/operations/redemptions/<id> with {status: "approved"}. | 200. DB: redemption status=approved. | P1 | API, DB | Both |
| TC-131 | List dividends (admin) | Logged in as admin | 1. GET /api/v1/admin/operations/dividends. | 200. | P2 | API | Both |
| TC-132 | Deposit dividend | Logged in as issuer | 1. POST /api/v1/admin/operations/dividends/deposit with {token_id, amount, tx_hash}. | 200. DB: dividend record. Chain: DividendDistributor.deposit() called (if deployed). | P1 | API, DB | Local |
| TC-133 | Replay webhook | Logged in as admin, webhook in DB | 1. POST /api/v1/admin/operations/webhooks/<id>/replay. | 200. webhook_events: attempts incremented, re-processed. | P2 | API, DB | Local |
| TC-134 | List webhooks | Logged in as admin | 1. GET /api/v1/admin/operations/webhooks. | 200. Array of webhook events. | P2 | API | Both |

---

## Category 10: Notifications

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-135 | List notifications — empty | Logged in, no notifications | 1. GET /api/v1/notifications/. | 200. Empty array. | P3 | API | Both |
| TC-136 | Unread count | Logged in | 1. GET /api/v1/notifications/unread-count. | 200. {count: 0} or actual count. | P3 | API | Both |
| TC-137 | Get preferences | Logged in | 1. GET /api/v1/notifications/preferences. | 200. Preferences object with email_*/inapp_* toggles (all boolean). | P2 | API | Both |
| TC-138 | Update preferences | Logged in | 1. PATCH /api/v1/notifications/preferences with {email_investment_updates: false}. | 200. DB: preference updated. | P2 | API, DB | Both |
| TC-139 | Mark notification read | Notification exists | 1. PATCH /api/v1/notifications/<id>/read. | 200. DB: read=true. | P3 | API, DB | Both |
| TC-140 | Mark all read | Multiple unread notifications | 1. POST /api/v1/notifications/mark-all-read. | 200. DB: all user's notifications read=true. | P3 | API, DB | Both |

---

## Category 10B: Dividends & OTC Deep Tests

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-228 | DividendDistributor pro-rata calculation | Token with 2 holders: alice (10%), bob (90%). Issuer deposits 1000 USDC dividend. | 1. POST dividend deposit of 1000 USDC. 2. GET /api/v1/portfolio/dividends as alice → claimable should be 100 USDC. 3. GET as bob → claimable should be 900 USDC. | Pro-rata: alice gets 10% (100 USDC), bob gets 90% (900 USDC). Sum = 1000 USDC. On-chain DividendDistributor math matches. | P0 | API, Chain | Local |
| TC-229 | Double dividend claim | TC-228, alice claims her 100 USDC | 1. Alice claims dividend → 200. 2. Alice claims same dividend again. | Second claim: 400 or 0 claimable. No double payout. On-chain: claimedAmount[alice] = 100 USDC. | P0 | API, Chain | Local |
| TC-230 | Claim dividend after transferring tokens | Alice holds 10%, claims dividend, then transfers tokens to charlie | 1. Deposit 1000 USDC dividend (snapshot taken). 2. Alice transfers all tokens to charlie. 3. Alice claims → should get 100 USDC (snapshot-based). 4. Charlie claims → should get 0 (wasn't holder at snapshot). | Dividend based on snapshot at deposit time, NOT current balance. Alice gets 100 even after transfer. Charlie gets 0 from this distribution. | P0 | API, Chain | Local |
| TC-231 | Dividend with 0 deposit | Issuer tries to deposit 0 USDC | 1. POST dividend deposit with amount: 0. | 422 or 400 — amount must be > 0. No dividend record created. | P2 | API | Both |
| TC-232 | OTC to non-KYC'd address | Sale active, target wallet not KYC'd | 1. POST /api/v1/sales/<id>/otc with {investor_wallet: "0xNOKYC...", token_amount: 100}. | Either: 400 — investor not KYC'd OR succeeds (OTC bypasses KYC check). Document behavior. If succeeds, verify on-chain token transfer respects identity registry. | P1 | API, DB, Chain | Local |
| TC-233 | OTC allocation exceeding remaining supply | Sale with 1000 tokens total, 900 already allocated | 1. POST OTC with token_amount: 200 (would exceed total). | 400 — exceeds remaining allocation. No contribution created. DB: total allocated unchanged. | P0 | API, DB | Both |

---

## Category 11: Issuer Withdrawals

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-141 | List withdrawals | Logged in as issuer | 1. GET /api/v1/issuer/withdrawals/. | 200. Array of withdrawal records. | P2 | API | Both |
| TC-142 | Execute withdrawal | Logged in as issuer, sale finalized successfully | 1. POST /api/v1/issuer/withdrawals/execute with {sale_id}. | 200. DB: withdrawal record, amount = raised - fees. Chain: USDC transferred to issuer wallet. | P0 | API, DB, Chain | Local |
| TC-143 | Execute withdrawal — sale not finalized | Sale still active | 1. POST /api/v1/issuer/withdrawals/execute with {sale_id}. | 400 — sale not finalized. | P1 | API | Both |
| TC-144 | Execute withdrawal — as investor (RBAC) | Logged in as alice | 1. POST /api/v1/issuer/withdrawals/execute. | 403. | P0 | API | Both |
| TC-145 | Double withdrawal | TC-142 done | 1. Try to execute withdrawal again for same sale. | 400 — already withdrawn. | P0 | API, DB | Both |

---

## Category 12: Cross-Cutting — RBAC Matrix

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-146 | Investor → admin/platform/settings | Alice | 1. GET /api/v1/admin/platform/settings. | 403. | P0 | API | Both |
| TC-147 | Investor → create token | Alice | 1. POST /api/v1/tokens/. | 403. | P0 | API | Both |
| TC-148 | Investor → create sale | Alice | 1. POST /api/v1/sales/. | 403. | P0 | API | Both |
| TC-149 | Issuer → platform settings | Issuer | 1. GET /api/v1/admin/platform/settings. | 403. | P0 | API | Both |
| TC-150 | Issuer → issuer management | Issuer | 1. GET /api/v1/admin/issuers/. | 403. | P0 | API | Both |
| TC-151 | Admin → contribute to sale | Admin (not investor) | 1. POST /api/v1/sales/<id>/contribute. | Should either work (admin has all access) or 403 (admin is not investor role). Document behavior. | P2 | API | Both |
| TC-152 | No auth → all admin routes | No token | 1. Hit every /admin/ endpoint without auth. | All return 401. | P0 | API | Both |
| TC-153 | No auth → all portfolio routes | No token | 1. Hit every /portfolio/ endpoint without auth. | All return 401. | P0 | API | Both |

---

## Category 13: Health & Infrastructure

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-154 | Health ready | API running | 1. GET /api/v1/health/ready. | 200. Checks DB + Redis connectivity. | P0 | API | Both |
| TC-155 | Health worker | Worker may/may not be running | 1. GET /api/v1/health/worker. | 200 with worker status. If worker not running, should report unhealthy but still return 200 (not crash). | P1 | API | Both |
| TC-156 | Health live | API running | 1. GET /api/v1/health/live. | 200 (simple liveness). | P1 | API | Both |
| TC-157 | API CORS headers | None | 1. Send OPTIONS request with Origin header. 2. Check Access-Control headers. | CORS headers present with restricted origins, methods, headers. No wildcard *. | P1 | API | Both |
| TC-158 | Security headers | None | 1. Send any request, check response headers. | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Strict-Transport-Security present. | P1 | API | Both |
| TC-159 | API trailing slash redirect | None | 1. GET /api/v1/tokens (no trailing slash). 2. GET /api/v1/tokens/ (with trailing slash). | Both work — either redirect or both return data. No 404 on one. | P2 | API | Both |

---

## Category 13B: Input Validation (Expanded)

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-234 | Empty string on required fields | None | 1. POST /api/v1/auth/register with {email: "", password: ""}. 2. POST /api/v1/tokens/ with {name: "", symbol: ""}. 3. POST /api/v1/sales/ with empty phases array. | All return 422. Pydantic validators reject empty strings on required fields. No DB rows created. | P1 | API | Both |
| TC-235 | Null values on required fields | None | 1. POST /api/v1/auth/register with {email: null, password: null}. 2. POST /api/v1/sales/ with {token_id: null}. | 422 for all. JSON null rejected on required fields. | P1 | API | Both |
| TC-236 | Whitespace-only strings | None | 1. POST /api/v1/tokens/ with {name: "   ", symbol: "   "}. 2. POST /api/v1/auth/register with {email: "   "}. | 422 for all. Whitespace-only should be treated as empty/invalid. If accepted, verify trimming behavior. | P1 | API | Both |
| TC-237 | USDC amount with 7 decimals (exceeds 6) | Logged in, sale active | 1. POST /api/v1/sales/<id>/contribute with {amount: "100.1234567", tx_hash: "0x..."}. | Either: 422 (too many decimals for USDC 6-decimal precision) OR amount truncated/rounded to 6 decimals. Verify no precision loss in DB (Decimal field). | P1 | API, DB | Both |
| TC-238 | Invalid Ethereum address — wrong checksum | None | 1. POST /api/v1/wallets/link with address "0xd8da6bf26964af9d7eed9e03e53415d37aa96044" (wrong checksum). | Either: 422 (invalid checksum) OR accepted (case-insensitive). Document behavior — EIP-55 checksum enforced? | P2 | API | Both |
| TC-239 | Invalid Ethereum address — wrong length | None | 1. POST /api/v1/wallets/link with address "0x1234" (too short). 2. POST with 50-char address. | 422 — Wallet schema enforces min_length=42, max_length=42. | P1 | API | Both |
| TC-240 | Null address (0x0000...0000) | None | 1. POST /api/v1/admin/compliance/freeze with wallet_address: "0x0000000000000000000000000000000000000000". 2. POST /api/v1/sales/<id>/otc with investor_wallet: "0x0000000000000000000000000000000000000000". | Either: 422 (zero address rejected) OR accepted. If accepted, verify on-chain behavior (zero address transfers always revert in ERC-20). | P1 | API, Chain | Local |
| TC-241 | Date — epoch 0 | Logged in as issuer | 1. POST /api/v1/sales/ with phase start_time: "1970-01-01T00:00:00Z". | Either: 422 (date too far in past) OR accepted. If accepted, phase is immediately expired and non-functional. | P2 | API | Both |
| TC-242 | Date — far future (year 9999) | Logged in as issuer | 1. POST /api/v1/sales/ with phase end_time: "9999-12-31T23:59:59Z". | Either: 422 (date too far) OR accepted. If accepted, sale runs effectively forever. Verify no integer overflow in timestamp conversion. | P2 | API | Both |
| TC-243 | File upload — wrong MIME type | Logged in as issuer, TGLD exists | 1. POST /api/v1/tokens/<id>/documents with file having Content-Type: application/x-executable. | 422 or 415 — unsupported file type. Only PDF/image/document types accepted. | P1 | API | Both |
| TC-244 | File upload — 0-byte file | Logged in as issuer | 1. POST /api/v1/tokens/<id>/documents with empty file (0 bytes). | 422 — empty file rejected. | P2 | API | Both |
| TC-245 | File upload — oversized file (>50MB) | Logged in as issuer | 1. POST /api/v1/tokens/<id>/documents with 100MB file. | 413 Payload Too Large or 422. Server does not OOM. | P1 | API | Both |
| TC-246 | File upload — executable disguised as PDF | Logged in as issuer | 1. Rename malware.exe to document.pdf. 2. POST upload with Content-Type: application/pdf. | Server should verify actual file content (magic bytes), not just extension/MIME. Either: reject (content mismatch) OR accept but never execute. Stored file is inert. | P0 | API | Local |

---

## Category 14: Race Conditions

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-247 | Double contribute — same wallet simultaneously | Alice KYC'd, sale active, 2 different tx hashes | 1. Send 2 POST /contribute requests simultaneously from alice (different tx_hash each). 2. Both claim 1000 USDC. | Both succeed OR one succeeds and one fails (if per-user max enforced). No data corruption. Total contributions = sum of accepted. No duplicate tx_hash. DB constraints hold. | P0 | API, DB | Local |
| TC-248 | Concurrent phase transition | Sale at exact phase boundary, 2 contributions submitted | 1. Submit contribution from alice at phase boundary (Phase 1 → Phase 2 transition). 2. Submit contribution from bob at same moment. | Each contribution attributed to correct phase based on timestamp. No contribution lost. No phase assignment inconsistency. | P1 | API, DB | Local |
| TC-249 | Concurrent finalization | Issuer sends 2 finalize requests simultaneously | 1. POST finalize twice at exact same time. | Exactly one succeeds (200), one fails (400 — already finalized). No double finalization. Sale state consistent. On-chain: single finalization tx. | P0 | API, DB, Chain | Local |
| TC-250 | KYC webhook delivered twice simultaneously | Sumsub fires webhook twice for same applicant | 1. Send 2 identical webhook POSTs simultaneously. | Idempotent: both return 200. DB: kyc_status set once. No duplicate identity deployment on-chain. webhook_events: at most 1 processed row (or 2 rows but status consistent). | P0 | API, DB, Chain | Local |
| TC-251 | Freeze + transfer race | Issuer freezing alice while alice initiates transfer | 1. Simultaneously: POST freeze alice + alice submits on-chain transfer. | Either: freeze completes first → transfer reverts. OR transfer completes first → freeze applies after. No inconsistent state where address is frozen but transfer went through after freeze tx confirmed. | P0 | Chain | Local |
| TC-252 | Claim + claim race (CiretaVault) | Alice has claimable vested tokens | 1. Send 2 POST /vesting/<id>/claim requests simultaneously. | Exactly one succeeds with correct amount. Second either fails (nothing to claim) or returns 0. No double-mint of security tokens. Vault state consistent. | P0 | API, Chain | Local |

---

## Category 14B: UI Smoke Tests — Launchpad

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-160 | Landing page loads | Launchpad running on :3000 | 1. Navigate to http://localhost:3000. | Page loads without JS errors. Key elements visible: nav, hero, featured projects. | P0 | UI | Both |
| TC-161 | Registration page | None | 1. Navigate to /register. | Form with email, password, display name fields. Submit button. | P1 | UI | Both |
| TC-162 | Login page | None | 1. Navigate to /login. | Form with email, password fields. "Forgot password?" link. | P1 | UI | Both |
| TC-163 | Explore page | At least one token exists | 1. Navigate to /explore. | Token cards visible with name, symbol, status. Filter/search functional. | P1 | UI | Both |
| TC-164 | Project detail page | Token with slug exists | 1. Navigate to /project/<slug>. | Token details: name, symbol, price, sale phases, invest CTA. No "undefined" or null values displayed. | P1 | UI | Both |
| TC-165 | Portfolio page — not logged in | Not authenticated | 1. Navigate to /portfolio. | Redirect to /login OR show "Sign in" prompt. No crash. | P1 | UI | Both |
| TC-166 | Portfolio page — logged in | Authenticated | 1. Login via UI. 2. Navigate to /portfolio. | Portfolio dashboard loads. Holdings, vesting, transactions tabs. No 500 errors in console. | P0 | UI | Both |
| TC-167 | Settings pages | Logged in | 1. Navigate to /settings, /settings/profile, /settings/wallets, /settings/notifications. | All pages load. Forms functional. No console errors. | P2 | UI | Both |
| TC-168 | Invest page | Sale with slug exists | 1. Navigate to /invest/<slug>. | Investment flow UI. Connect wallet CTA. Phase details. | P1 | UI | Both |
| TC-169 | User menu in navbar | Logged in | 1. Check navbar after login. | User name/avatar visible. Dropdown with Account, Settings, Logout. | P2 | UI | Both |

---

## Category 15: UI Smoke Tests — Admin

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-170 | Admin login page | Admin running on :3001 | 1. Navigate to http://localhost:3001/login. | Login form. No console errors. | P0 | UI | Both |
| TC-171 | Admin dashboard (issuer view) | Logged in as issuer | 1. Login at /login. 2. Redirected to /issuer/overview. | Dashboard shows: Total Raised, Active Sales, Total Investors, Fees Earned. Quick Actions links. | P0 | UI | Both |
| TC-172 | Tokens page | Logged in as issuer | 1. Navigate to /issuer/tokens. | Token list with TGLD. Click → token detail. | P1 | UI | Both |
| TC-173 | Token creation form | Logged in as issuer | 1. Navigate to /issuer/tokens/new. | Multi-step form. All fields functional. | P1 | UI | Both |
| TC-174 | Sales page | Logged in as issuer | 1. Navigate to /issuer/sales. | Sale list. Status badges. | P1 | UI | Both |
| TC-175 | Compliance page | Logged in as issuer | 1. Navigate to /issuer/compliance. | Freeze/unfreeze forms. Audit logs. | P1 | UI | Both |
| TC-176 | Investors page | Logged in as issuer | 1. Navigate to /issuer/investors. | Investor list with KYC status. | P2 | UI | Both |
| TC-177 | Withdrawals page | Logged in as issuer | 1. Navigate to /issuer/withdrawals. | Withdrawal list/form. | P2 | UI | Both |
| TC-178 | Dividends page | Logged in as issuer | 1. Navigate to /issuer/dividends. | Dividend deposit form. History. | P2 | UI | Both |
| TC-179 | Platform pages — as admin | Logged in as admin | 1. Navigate to /platform/issuers, /platform/settings, /platform/users, /platform/analytics, /platform/compliance. | All pages load without errors. Data from API. | P1 | UI | Both |

---

## Category 15B: Service Kill Tests

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-253 | Kill PostgreSQL mid-request | API running, DB connected | 1. Start a long-running request (e.g., list sales with large dataset). 2. `docker stop cireta-db` mid-request. 3. Check API response. | API returns clean error (503 or 500 with JSON body like {"detail": "Service unavailable"}). No stack trace in response body. No leaked DB connection strings. | P0 | API | Local |
| TC-254 | Kill Redis → rate limiting behavior | API running, Redis connected | 1. `docker stop cireta-redis`. 2. Send 100 login requests rapidly. 3. Check if rate limiting still applies. | Either: fail-closed (all requests rejected — safer) OR fail-open (rate limiting disabled — requests pass through). Document behavior. No unhandled exception. API still serves requests. | P0 | API | Local |
| TC-255 | RPC unavailable → circuit breaker | API running | 1. Block outbound to Base Sepolia RPC (iptables/hosts). 2. POST deploy token. 3. POST contribute. 4. GET on-chain status. | Deploy/contribute: clean 503 with message "blockchain unavailable". On-chain status: 503. No hang (timeout < 30s). If circuit breaker exists: subsequent requests fail fast without attempting RPC. | P0 | API, Chain | Local |
| TC-256 | API 500 → UI error display | Launchpad running | 1. Trigger a 500 error on API (e.g., corrupt DB record). 2. Navigate to affected page in UI. | UI shows user-friendly error ("Something went wrong") NOT raw stack trace, NOT JSON blob. Console may log details but visible page is clean. | P1 | UI, API | Local |
| TC-257 | Error response audit — no leaked internals | All endpoints | 1. Trigger errors on every endpoint type (400, 401, 403, 404, 422, 500). 2. Inspect every error response body. | NO response contains: stack traces, DB table/column names, SQL queries, private keys, internal IP addresses, file system paths. All errors use structured {"detail": "..."} format. | P0 | API | Both |

---

## Category 16: Explore Page

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-258 | All active offerings shown | Multiple sales in DB (active + draft + finalized) | 1. GET /api/v1/sales/?status_filter=active. 2. Navigate to /explore in UI. 3. Count visible project cards. 4. Cross-reference with DB: SELECT count(*) FROM token_sales WHERE status='active'. | UI card count matches API total matches DB count. No active sale missing from explore page. | P0 | API, UI, DB | Both |
| TC-259 | Filter by asset type | Sales with different token asset_types (commodity, real_estate, equity) | 1. Navigate to /explore. 2. Apply asset type filter (e.g., "commodity"). 3. Verify only commodity tokens shown. | Filtered results match DB: only tokens with asset_type='commodity' and active sales displayed. Count matches. | P1 | UI, API | Both |
| TC-260 | Filter by sale status | Sales in various statuses | 1. Navigate to /explore. 2. Filter by "active" status. 3. Filter by "upcoming". 4. Filter by "completed". | Each filter shows only matching sales. Counts match DB queries. No stale data. | P1 | UI, API | Both |
| TC-261 | Search by name/symbol | TGLD exists | 1. Navigate to /explore. 2. Search "Gold". 3. Search "TGLD". 4. Search "nonexistent". | "Gold" and "TGLD" return TGLD card. "nonexistent" returns empty state. Search is case-insensitive. | P1 | UI, API | Both |
| TC-262 | Project card data matches DB | TGLD sale active | 1. GET sale via API → note token_name, token_symbol, total_raised, hard_cap, status. 2. View same card on /explore. 3. Cross-reference every displayed field. | All fields match: name, symbol, asset type, status badge, raised amount, cap. No "undefined", no stale cached data. | P1 | UI, API, DB | Both |
| TC-263 | Progress bar math | Sale with total_raised = 2500 USDC, hard_cap = 5000 USDC | 1. View project card on /explore. 2. Verify progress bar width ≈ 50%. 3. Verify displayed percentage = "50%". 4. Verify calculation: (total_raised / hard_cap) * 100. | Progress bar visually at 50%. Displayed text shows "50%" or "$2,500 / $5,000". Math correct. Edge cases: 0% (empty bar), 100% (full bar). | P1 | UI | Both |
| TC-264 | Empty state — no active offerings | No active sales in DB | 1. Ensure all sales are draft/finalized (none active). 2. Navigate to /explore. | Clean empty state: "No active offerings" or similar message. No broken layout. No JS errors. | P2 | UI | Both |

---

## Category 16B: Error Handling & Edge Cases

| ID | Test Case | Preconditions | Steps | Expected Result | Severity | Layers | Env |
|---|---|---|---|---|---|---|---|
| TC-180 | API 404 for unknown routes | None | 1. GET /api/v1/nonexistent. | 404 JSON error (not HTML). | P2 | API | Both |
| TC-181 | Oversized request body | None | 1. POST /api/v1/auth/register with 10MB body. | 413 or 422. No server crash. | P2 | API | Both |
| TC-182 | Malformed JSON body | None | 1. POST /api/v1/auth/login with body: "not json". | 422. | P2 | API | Both |
| TC-183 | Content-Type mismatch | None | 1. POST /api/v1/auth/login with Content-Type: text/plain and JSON body. | Either 422/415 or processes normally. Document behavior. | P3 | API | Both |
| TC-184 | UUID format validation | None | 1. GET /api/v1/tokens/not-a-uuid. | 422 or 404. No 500. | P2 | API | Both |
| TC-185 | SQL injection in query params | None | 1. GET /api/v1/tokens/?status=active' OR '1'='1. | 200 with filtered results (parameterized query). No SQL error. | P0 | API | Both |
| TC-186 | API under DB outage | Stop PostgreSQL container | 1. Stop cireta-db. 2. GET /api/v1/health/ready. 3. GET /api/v1/auth/login. | health/ready: returns unhealthy status (not crash). login: returns 503 or 500 with graceful error. | P1 | API | Local |
| TC-187 | API under Redis outage | Stop Redis container | 1. Stop cireta-redis. 2. GET /api/v1/auth/login. | Either: works (Redis optional for auth) OR returns graceful 503. No unhandled exception. | P1 | API | Local |

---

## Test Count Summary

| Category | Tests | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| 1: Auth & Sessions | 44 | 16 | 19 | 7 | 2 |
| 2: KYC & Identity | 12 | 4 | 4 | 3 | 1 |
| 3: Wallets & SIWE | 8 | 1 | 4 | 3 | 0 |
| 4: Token Creation | 12 | 3 | 3 | 5 | 1 |
| 4B: Token Boundary Cases | 6 | 1 | 4 | 1 | 0 |
| 5: Sale Lifecycle | 19 | 7 | 7 | 5 | 0 |
| 5B: Sale Edge Cases | 9 | 1 | 7 | 1 | 0 |
| 6: Portfolio | 9 | 1 | 3 | 5 | 0 |
| 6B: Vested Mode Investment | 6 | 6 | 0 | 0 | 0 |
| 6C: Phase Transitions | 2 | 1 | 1 | 0 | 0 |
| 7: Compliance | 13 | 4 | 4 | 4 | 1 |
| 7B: Finalization Edge Cases | 8 | 3 | 4 | 1 | 0 |
| 8: Issuer Management | 11 | 3 | 4 | 4 | 0 |
| 8B: Compliance Deep Tests | 9 | 5 | 2 | 2 | 0 |
| 9: Admin Operations | 6 | 0 | 2 | 4 | 0 |
| 10: Notifications | 6 | 0 | 0 | 3 | 3 |
| 10B: Dividends & OTC Deep | 6 | 3 | 1 | 1 | 1 |
| 11: Withdrawals | 5 | 3 | 1 | 1 | 0 |
| 12: RBAC Matrix | 8 | 6 | 0 | 2 | 0 |
| 13: Health & Infra | 6 | 1 | 3 | 2 | 0 |
| 13B: Input Validation (Expanded) | 13 | 1 | 7 | 5 | 0 |
| 14: Race Conditions | 6 | 5 | 1 | 0 | 0 |
| 14B: UI — Launchpad | 10 | 2 | 5 | 3 | 0 |
| 15: UI — Admin | 10 | 2 | 5 | 3 | 0 |
| 15B: Service Kill Tests | 5 | 3 | 1 | 1 | 0 |
| 16: Explore Page | 7 | 1 | 4 | 2 | 0 |
| 16B: Error Handling | 8 | 1 | 2 | 4 | 1 |
| **TOTAL** | **270** | **83** | **98** | **72** | **10** |

---

## Execution Notes

### Checkpoint Schedule
- Checkpoint 1: After TC-010
- Checkpoint 2: After TC-020
- Checkpoint 3: After TC-030
- Checkpoint 4: After TC-040
- ... (every 10 tests)
- Final checkpoint: After TC-270

### New Test Categories Added (v2.0)
- **4B: Token Boundary Cases** (TC-188 → TC-193) — 6 tests
- **5B: Sale Edge Cases** (TC-194 → TC-202) — 9 tests
- **6B: Vested Mode Investment** (TC-203 → TC-208) — 6 tests
- **6C: Phase Transitions** (TC-209 → TC-210) — 2 tests
- **7B: Finalization Edge Cases** (TC-211 → TC-218) — 8 tests
- **8B: Compliance Deep Tests** (TC-219 → TC-227) — 9 tests
- **10B: Dividends & OTC Deep** (TC-228 → TC-233) — 6 tests
- **13B: Input Validation Expanded** (TC-234 → TC-246) — 13 tests
- **14: Race Conditions** (TC-247 → TC-252) — 6 tests
- **15B: Service Kill Tests** (TC-253 → TC-257) — 5 tests
- **16: Explore Page** (TC-258 → TC-264) — 7 tests

**Total new tests: 83 (TC-188 → TC-270)**

### Environment Setup Required
1. Start all services: `docker compose up -d` + API + Launchpad + Admin
2. Reset DB to baseline: seed script with 6 users, 1 token, 1 sale
3. Set rate limits to test values (50/min login, 100/min default)
4. Ensure Base Sepolia RPC accessible
5. Browser automation: Playwright for UI tests
6. **NEW:** For race condition tests: use concurrent HTTP clients (asyncio/aiohttp or wrk)
7. **NEW:** For service kill tests: docker stop/start individual containers
8. **NEW:** For vesting tests: time manipulation (either hardhat fork with evm_increaseTime or DB time overrides)

### Cross-Layer Verification Tools
- **API**: curl / httpie
- **DB**: `docker exec cireta-db psql -U cireta -d cireta -c "<query>"`
- **Redis**: `redis-cli -p 6379`
- **Chain**: `cast call <address> "<function_sig>" --rpc-url https://sepolia.base.org`
- **UI**: Playwright browser automation + screenshots
- **Concurrency**: `wrk`, `hey`, or Python asyncio for race condition tests
