# Cireta RWA Launchpad — Definitive E2E UI Test Plan

> **Last updated:** 2026-03-24
> **Scope:** Every page, form, button, API endpoint, smart contract function, state machine transition, error path, loading state, and edge case across the entire Cireta platform.
> **Usage:** Manual QA — test every pixel.

---

## Table of Contents

1. [Test Environment & Prerequisites](#1-test-environment--prerequisites)
2. [Test Data Setup](#2-test-data-setup)
3. [Launchpad — Authentication & Onboarding](#3-launchpad--authentication--onboarding)
4. [Launchpad — KYC Verification](#4-launchpad--kyc-verification)
5. [Launchpad — Wallet Management](#5-launchpad--wallet-management)
6. [Launchpad — Explore & Project Discovery](#6-launchpad--explore--project-discovery)
7. [Launchpad — Project Detail Page](#7-launchpad--project-detail-page)
8. [Launchpad — Investment Flow](#8-launchpad--investment-flow)
9. [Launchpad — Portfolio](#9-launchpad--portfolio)
10. [Launchpad — Token Claiming & Vesting](#10-launchpad--token-claiming--vesting)
11. [Launchpad — Dividend Claims](#11-launchpad--dividend-claims)
12. [Launchpad — Redemptions](#12-launchpad--redemptions)
13. [Launchpad — Transaction History](#13-launchpad--transaction-history)
14. [Launchpad — Settings](#14-launchpad--settings)
15. [Launchpad — Account Page](#15-launchpad--account-page)
16. [Launchpad — Notifications](#16-launchpad--notifications)
17. [Admin — Authentication](#17-admin--authentication)
18. [Admin — Issuer Dashboard Overview](#18-admin--issuer-dashboard-overview)
19. [Admin — Token Management](#19-admin--token-management)
20. [Admin — Sale Management](#20-admin--sale-management)
21. [Admin — OTC Allocations](#21-admin--otc-allocations)
22. [Admin — Investor Management](#22-admin--investor-management)
23. [Admin — Compliance Actions](#23-admin--compliance-actions)
24. [Admin — Token Recovery](#24-admin--token-recovery)
25. [Admin — Dividend Management](#25-admin--dividend-management)
26. [Admin — Redemption Management](#26-admin--redemption-management)
27. [Admin — Issuer Withdrawals](#27-admin--issuer-withdrawals)
28. [Admin — Reports](#28-admin--reports)
29. [Platform Admin — Analytics](#29-platform-admin--analytics)
30. [Platform Admin — Issuer Management](#30-platform-admin--issuer-management)
31. [Platform Admin — User Management](#31-platform-admin--user-management)
32. [Platform Admin — Compliance Overview](#32-platform-admin--compliance-overview)
33. [Platform Admin — Settings](#33-platform-admin--settings)
34. [Smart Contract Tests](#34-smart-contract-tests)
35. [State Machine Tests](#35-state-machine-tests)
36. [On-Chain vs Off-Chain Consistency](#36-on-chain-vs-off-chain-consistency)
37. [Webhook & Event Listener Tests](#37-webhook--event-listener-tests)
38. [Worker / Background Task Tests](#38-worker--background-task-tests)
39. [Email Service Tests](#39-email-service-tests)
40. [API-Level Security & Validation](#40-api-level-security--validation)
41. [CORS, CSP & Security Headers](#41-cors-csp--security-headers)
42. [Race Conditions & Concurrency](#42-race-conditions--concurrency)
43. [Responsive & Cross-Browser](#43-responsive--cross-browser)
44. [Accessibility](#44-accessibility)

---

## 1. Test Environment & Prerequisites

### Infrastructure (docker-compose.yml)
| Service | Port | Healthcheck |
|---------|------|-------------|
| PostgreSQL 16 | 5432 | `pg_isready` |
| Redis 7 | 6379 | `redis-cli ping` |
| API (FastAPI) | 8000 | `GET /api/v1/health/live` |
| Worker | — | Redis key `cireta:worker:heartbeat` |
| Launchpad (Next.js) | 3000 | `wget localhost:3000/` |
| Admin (Next.js) | 3001 | `wget localhost:3000/` |

### Blockchain
- **Network:** Base Sepolia testnet (chain ID from `hardhat.config.ts`)
- **Deployed contracts** (`contracts/deployments/base-sepolia.json`):
  - `identityRegistryStorage`: `0xFEe7c667db9b54767A8772dcBC81a9d177C0954E`
  - `claimTopicsRegistry`: `0xc2A8F6ef64B375872dBf09BD3Eb650a620687F02`
  - `trustedIssuersRegistry`: `0xA695Dd3a5bc6c34BC914a650fAa46596e2E03319`
  - `issuerRegistry`: `0x3bdE32b8AC48d8015e34E2335B5a640072105225`
  - `platformFeeManager`: `0x545Ce9dc34E3086B505D9fd8DB443906E2c796f6`
  - `tokenFactory`: `0x6918cE85Da96C07Deaeba796512422ab8AEEB99D`
  - `saleFactory`: `0xe4a06Eaa949D12B173B0bA5f7CaABe473b4e8b5F`
  - `countryAllowModule`: `0xce620bd7213ed4b56D5AEFc445C3da95C4C7bd24`
  - `maxHolderCountModule`: `0xC21EA2D0f85b25D29e2f9e971d5F76a54986c585`

### Pre-checks
| # | Check | Command / Action | Expected |
|---|-------|-----------------|----------|
| 1.1 | Docker services up | `docker compose up -d && docker compose ps` | All 6 services healthy |
| 1.2 | API health-live | `curl http://localhost:8000/api/v1/health/live` | `{"status":"ok"}` |
| 1.3 | API health-ready | `curl http://localhost:8000/api/v1/health/ready` | `{"status":"ok","db":"ok","redis":"ok"}` |
| 1.4 | Launchpad loads | Browser → `http://localhost:3000` | Home page renders |
| 1.5 | Admin loads | Browser → `http://localhost:3001` | Redirects to `/issuer/overview` or login |
| 1.6 | DB connectivity | `psql -h localhost -U cireta -d cireta -c '\dt'` | Tables listed |
| 1.7 | Redis connectivity | `redis-cli ping` | `PONG` |
| 1.8 | Worker heartbeat | `redis-cli GET cireta:worker:heartbeat` | Non-null timestamp |
| 1.9 | RPC connectivity | API can call Base Sepolia RPC | No timeout errors in logs |

---

## 2. Test Data Setup

### Users

| Alias | Email | Password | Role | KYC Level | Purpose |
|-------|-------|----------|------|-----------|---------|
| `investor_alice` | alice@test.cireta.com | `Test1234!@` | investor | 0 → 2 | Primary investor journey |
| `investor_bob` | bob@test.cireta.com | `Test1234!@` | investor | 0 | KYC-pending investor |
| `investor_carol` | carol@test.cireta.com | `Test1234!@` | investor | 2 | Pre-verified investor |
| `investor_dan` | dan@test.cireta.com | `Test1234!@` | investor | 0 | Never completes KYC |
| `investor_corporate` | corp@test.cireta.com | `Test1234!@` | investor | 0 → 4 | Corporate KYB flow |
| `issuer_gold` | issuer-gold@test.cireta.com | `Test1234!@` | issuer | — | Gold token issuer |
| `issuer_copper` | issuer-copper@test.cireta.com | `Test1234!@` | issuer | — | Copper token issuer |
| `platform_admin` | admin@test.cireta.com | `Test1234!@` | admin | — | Platform administrator |
| `attacker` | evil@test.cireta.com | `Test1234!@` | investor | 0 | Pen-test user |
| `frozen_user` | frozen@test.cireta.com | `Test1234!@` | investor | 2 | Gets frozen mid-test |

### Wallets (Base Sepolia)

| Alias | Address | Purpose |
|-------|---------|---------|
| `wallet_alice` | (generate) | Alice's primary wallet |
| `wallet_alice_2` | (generate) | Alice's secondary wallet |
| `wallet_bob` | (generate) | Bob's wallet |
| `wallet_carol` | (generate) | Carol's wallet with USDC |
| `wallet_issuer_gold` | (generate) | Gold issuer wallet |
| `wallet_frozen` | (generate) | Wallet to freeze |
| `wallet_lost` | (generate) | Wallet for recovery test |
| `wallet_sanctioned` | (known sanctioned) | Wallet screening test |

### Tokens

| Alias | Name | Symbol | Asset Type | Supply | Purpose |
|-------|------|--------|------------|--------|---------|
| `GOLD1` | Cireta Gold | CGLD | commodity | 1,000,000 | Primary sale token |
| `COPR1` | Cireta Copper | CCPR | commodity | 500,000 | Secondary token |
| `UNPD` | Undeployed Token | UNPD | commodity | 100,000 | Created but not deployed |

### Sales

| Alias | Token | Status | Soft Cap | Hard Cap | Purpose |
|-------|-------|--------|----------|----------|---------|
| `sale_gold_active` | CGLD | active | $50,000 | $500,000 | Primary investment flow |
| `sale_copper_draft` | CCPR | draft | $10,000 | $100,000 | Draft → active transition |
| `sale_finalized_success` | (mock) | finalized | — | — | Claim tokens flow |
| `sale_finalized_failed` | (mock) | failed | — | — | Refund claim flow |

### Sale Phases (for `sale_gold_active`)

| Phase # | Name | Price/Token | Min Contrib | Max Contrib | Allocation | Active |
|---------|------|-------------|-------------|-------------|------------|--------|
| 1 | Seed | $0.10 | $100 | $50,000 | 200,000 | Yes |
| 2 | Private | $0.15 | $500 | $100,000 | 300,000 | No |
| 3 | Public | $0.20 | $50 | $25,000 | 500,000 | No |

---

## 3. Launchpad — Authentication & Onboarding

### 3.1 Registration (`/register`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 3.1.1 | Page renders | Navigate to `/register` | "Create Account" title, email/password/confirm fields, ToS checkbox, Google OAuth button | — |
| 3.1.2 | Valid registration | Fill alice@test.cireta.com, `Test1234!@`, confirm, check ToS, submit | Redirect to `/verify`, no error | `SELECT * FROM users WHERE email='alice@test.cireta.com'` → row exists, `role='investor'`, `kyc_status='none'`, `kyc_level=0` |
| 3.1.3 | Password mismatch | Password ≠ Confirm Password, submit | Client-side error: "Passwords do not match" | No DB row created |
| 3.1.4 | ToS not checked | Fill valid data, don't check ToS, submit | Error: "Please agree to the Terms of Service" | No request sent |
| 3.1.5 | Weak password — no uppercase | `test1234!@` | Server error: "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character" | 422 from API |
| 3.1.6 | Weak password — no special char | `Test12345` | Same complexity error | 422 |
| 3.1.7 | Weak password — too short | `Te1!` | Server error: min 8 characters | 422 |
| 3.1.8 | Weak password — no digit | `TestTest!@` | Complexity error | 422 |
| 3.1.9 | Invalid email | `not-an-email`, submit | HTML5 validation or server 422 | No request |
| 3.1.10 | Duplicate email | Register same email twice | Error: appropriate message (e.g., "Email already registered") | Only one row in DB |
| 3.1.11 | Empty form submit | Submit with all fields empty | HTML `required` prevents submission | — |
| 3.1.12 | XSS in email | `<script>alert(1)</script>@test.com` | Rejected or sanitized | No script execution |
| 3.1.13 | SQL injection in email | `' OR 1=1 --@test.com` | Rejected (invalid email format) | No DB injection |
| 3.1.14 | Very long email | 256+ character email | Server 422 (EmailStr validation) | — |
| 3.1.15 | Very long password | 129 character password | Server 422: max 128 characters | — |
| 3.1.16 | Display name in form | If display_name field exists | Accepts up to 100 chars | DB `display_name` column set |
| 3.1.17 | Loading state | Click submit with valid data | Button shows spinner, becomes disabled, text changes | — |
| 3.1.18 | Network error | Disconnect network, submit | Error: "Registration failed" | — |
| 3.1.19 | Double-click submit | Rapidly click submit twice | Only one registration attempt (button disabled after first click) | Only one DB row |
| 3.1.20 | Links work | Click "Sign in" link | Navigates to `/login` | — |
| 3.1.21 | ToS link | Click "Terms of Service" | Opens `https://cireta.com/terms-of-service` in new tab | — |
| 3.1.22 | Privacy link | Click "Privacy Policy" | Opens `https://cireta.com/privacy-policy` in new tab | — |
| 3.1.23 | Password visibility toggle | Click eye icon | Password field toggles between `type=password` and `type=text` | — |
| 3.1.24 | Password hint text | Below password field | Shows "At least 8 characters with uppercase, lowercase, and number" | — |
| 3.1.25 | Google OAuth button | Click "Continue with Google" | (Stub) Shows Google OAuth flow or appropriate message | — |

### 3.2 Login (`/login`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 3.2.1 | Page renders | Navigate to `/login` | "Welcome Back" title, email/password fields, Remember me, Forgot password link, Google OAuth | — |
| 3.2.2 | Valid login | Enter valid credentials, submit | Redirect to `/explore` | JWT issued, refresh token set as httpOnly cookie |
| 3.2.3 | Wrong password | Enter valid email, wrong password | Error banner: "Login failed" (or specific message) | 401 from API |
| 3.2.4 | Non-existent email | Enter unregistered email | Same generic error (no email enumeration) | 401 |
| 3.2.5 | Empty email | Submit with empty email | HTML `required` prevents | — |
| 3.2.6 | Empty password | Submit with empty password | HTML `required` prevents | — |
| 3.2.7 | Password visibility | Click eye icon | Toggles visibility | — |
| 3.2.8 | Remember me checkbox | Check "Remember me" | Checkbox checks (functionality TBD) | — |
| 3.2.9 | Forgot password link | Click "Forgot password?" | Navigates to `/forgot-password` | — |
| 3.2.10 | Create account link | Click "Create account" | Navigates to `/register` | — |
| 3.2.11 | Loading state | Submit | Button shows spinner/loading, disabled | — |
| 3.2.12 | Brute force protection | Submit wrong password 10+ times rapidly | Rate limited (429) or account lockout | API rate limit headers |
| 3.2.13 | Session persistence | Login, close tab, open again | User still logged in (token in storage/cookie) | — |
| 3.2.14 | Token expiry | Wait for JWT to expire | Next API call triggers refresh or redirects to login | Refresh token cookie used |
| 3.2.15 | MFA required | If user has MFA enabled | Response includes `requires_mfa: true`, redirect to MFA verification | — |
| 3.2.16 | Google OAuth | Click "Continue with Google" | Initiates OAuth flow | — |

### 3.3 Forgot Password (`/forgot-password`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 3.3.1 | Page renders | Navigate | "Forgot Password" title, email input, "Send Reset Link" button, "Back to Login" link | — |
| 3.3.2 | Valid email | Enter registered email, submit | Success screen: "Check Your Email" with message "If an account exists for <email>, we've sent password reset instructions." | Email service called (check logs) |
| 3.3.3 | Non-existent email | Enter unregistered email | Same success message (no enumeration) | No email sent, but 200 response |
| 3.3.4 | Empty email | Submit with empty | Button disabled or HTML required | — |
| 3.3.5 | Invalid email format | Submit `not-email` | HTML5 validation rejects | — |
| 3.3.6 | Loading state | Click "Send Reset Link" | Button shows "Sending...", disabled | — |
| 3.3.7 | Network error | Disconnect, submit | Error: "Something went wrong. Please try again." | — |
| 3.3.8 | Back to Login link | Click "Back to Login" | Navigates to `/login` | — |
| 3.3.9 | Back to Login from success | Click "Back to Login" after success | Navigates to `/login` | — |
| 3.3.10 | Cireta logo link | Click logo | Navigates to `/` | — |

### 3.4 Reset Password (`/reset-password?token=xxx`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 3.4.1 | Valid token | Navigate with valid token from email | "Reset Password" form with new password + confirm fields | — |
| 3.4.2 | Missing token | Navigate to `/reset-password` (no `?token=`) | "Invalid Link" screen with "Request New Link" button | — |
| 3.4.3 | Expired token | Use expired reset token | Error: "Link is invalid or expired. Please request a new one." | — |
| 3.4.4 | Successful reset | Enter matching valid passwords, submit | Success: "Password Reset" → "Sign In" button | DB: password hash updated |
| 3.4.5 | Password mismatch | Different passwords | Error: "Passwords do not match." | — |
| 3.4.6 | Weak password | < 8 chars | Error: "Password must be at least 8 characters." | — |
| 3.4.7 | Weak password — complexity | No special char | Server error: complexity requirements | 422 |
| 3.4.8 | Loading state | Submit valid form | Button shows "Resetting...", disabled | — |
| 3.4.9 | Double-use token | Use same reset token twice | First succeeds, second fails: "Link is invalid or expired" | Token invalidated after use |
| 3.4.10 | Request New Link button | Click from invalid link screen | Navigates to `/forgot-password` | — |

### 3.5 MFA (Two-Factor Authentication)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 3.5.1 | Setup MFA | POST `/api/v1/auth/mfa/setup` | Returns `secret` and `uri` (QR code data) | — |
| 3.5.2 | Enable MFA | POST `/api/v1/auth/mfa/enable` with valid 6-digit TOTP code | MFA enabled, backup codes returned | DB: `mfa_enabled=true`, `mfa_secret` stored encrypted |
| 3.5.3 | Enable MFA — invalid code | POST with wrong code | 400: "Invalid MFA code" | MFA remains disabled |
| 3.5.4 | Login with MFA | Login → get `requires_mfa: true` → submit code | Full auth token issued | — |
| 3.5.5 | Login with MFA — wrong code | Submit wrong TOTP code | Error: invalid code | No token issued |
| 3.5.6 | Backup code usage | Use backup code instead of TOTP | Succeeds, backup code consumed | DB: backup code marked used |
| 3.5.7 | Disable MFA | POST `/api/v1/auth/mfa/disable` with valid code | MFA disabled | DB: `mfa_enabled=false` |
| 3.5.8 | MFA code format | Submit 5-digit or 7-digit code | Rejected (6-8 chars required) | 422 |

---

## 4. Launchpad — KYC Verification

### 4.1 Personal KYC (`/verify`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 4.1.1 | Page renders | Navigate to `/verify` | Two tabs: Personal (active) and Corporate. Sumsub widget loads in white card. | — |
| 4.1.2 | Sumsub token fetch | Page load triggers `/api/v1/kyc/token` | Access token returned for Sumsub SDK | API: creates/retrieves Sumsub applicant |
| 4.1.3 | Tab switching | Click "Corporate" tab | Navigates to `/verify/corporate` | — |
| 4.1.4 | SDK loads in Suspense | While SDK loads | Spinner shown in Suspense fallback | — |
| 4.1.5 | SDK error | SDK fails to initialize | Error fallback: "Failed to load verification. Please try again." with Retry button | — |
| 4.1.6 | Retry button | Click Retry after error | `window.location.reload()` called | — |
| 4.1.7 | KYC completion callback | Complete Sumsub flow successfully | Status changes to pending, then approved via webhook | DB: `kyc_status` transitions `none → pending → approved`, `kyc_level` set to 2 |
| 4.1.8 | Not logged in | Navigate to `/verify` without auth | Should redirect to login or show error | — |
| 4.1.9 | Already verified | Navigate when KYC approved | Show approved status / redirect | — |

### 4.2 KYC Status Transitions (State Machine)

| # | From State | Trigger | To State | Backend Check |
|---|-----------|---------|----------|---------------|
| 4.2.1 | `none` | User initiates Sumsub | `pending` | `users.kyc_status = 'pending'` |
| 4.2.2 | `pending` | Sumsub webhook: approved | `approved` | `kyc_status='approved'`, `kyc_level=2`, email sent |
| 4.2.3 | `pending` | Sumsub webhook: rejected | `rejected` | `kyc_status='rejected'`, rejection email sent |
| 4.2.4 | `approved` | Time passes beyond expiry | `expired` | KYC expiry service sets status |
| 4.2.5 | `rejected` | User re-initiates | `pending` | New Sumsub session |
| 4.2.6 | `expired` | User re-verifies | `pending` → `approved` | Fresh Sumsub flow |

### 4.3 Corporate KYB (`/verify/corporate`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 4.3.1 | Page renders | Navigate to `/verify/corporate` | Form with Company Name, Registration Number, Jurisdiction fields | — |
| 4.3.2 | Submit valid form | Fill all 3 fields, click "Submit for Verification" | Advances to SDK step with Sumsub document upload | API: `POST /api/v1/kyc/corporate` → access token |
| 4.3.3 | Missing company name | Leave company name blank | Button disabled (all required fields must be filled) | — |
| 4.3.4 | Missing registration number | Leave blank | Button disabled | — |
| 4.3.5 | Missing jurisdiction | Leave blank | Button disabled | — |
| 4.3.6 | SDK document upload | Complete document upload in Sumsub widget | Advances to "Under Review" (processing step) | — |
| 4.3.7 | Processing state | After document submission | Shows "Under Review" with spinning loader, "Continue Browsing" button | — |
| 4.3.8 | Approved state | KYB approved via webhook | Shows "Corporate KYB Verified" with checkmark, "Level 4", "Start Investing" button | DB: `kyc_level=4` |
| 4.3.9 | Error state | SDK initialization fails | Shows error screen with "Try Again" button | — |
| 4.3.10 | Already pending | Navigate when application pending | Shows "Under Review" directly (skips form) | API status check on mount |
| 4.3.11 | Already verified | Navigate when already KYB approved | Shows "Corporate KYB Verified" directly | — |
| 4.3.12 | Not logged in | Navigate without auth | Shows error: "Please log in first" | — |
| 4.3.13 | Token expiry handling | Sumsub token expires mid-flow | `expirationHandler` re-fetches token automatically | — |
| 4.3.14 | Continue Browsing | Click from processing step | Navigates to `/explore` | — |
| 4.3.15 | Start Investing | Click from approved step | Navigates to `/explore` | — |

### 4.4 KYC Sumsub Webhook (`POST /api/v1/kyc/webhook`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 4.4.1 | Valid approval webhook | Send Sumsub webhook with approved status | User's `kyc_status` → `approved`, `kyc_level` set, email sent |
| 4.4.2 | Valid rejection webhook | Send rejection webhook | `kyc_status` → `rejected`, rejection email sent |
| 4.4.3 | Invalid signature | Send webhook with bad signature | 400/401 — webhook rejected |
| 4.4.4 | Unknown applicant | Webhook for non-existent applicant ID | 404 or graceful skip |
| 4.4.5 | Duplicate webhook | Send same approval webhook twice | Idempotent — no error, no duplicate processing |
| 4.4.6 | Webhook stored | Any webhook | Stored in `webhook_events` table with `provider='sumsub'` |

### 4.5 KYC Expiry Service

| # | Test Case | Expected Result | Backend Check |
|---|-----------|-----------------|---------------|
| 4.5.1 | User within expiry window | No change | `kyc_status` remains `approved` |
| 4.5.2 | User 30 days from expiry | Warning email sent | `send_kyc_expiry_warning()` called |
| 4.5.3 | User past expiry date | Status set to `expired` | `kyc_status='expired'` in DB |
| 4.5.4 | Already expired user | No re-processing | Idempotent |

---

## 5. Launchpad — Wallet Management

### 5.1 Wallet Linking (`/settings/wallets`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 5.1.1 | Page renders — no wallets | Navigate, no wallets linked | "No wallets linked yet." message, connector buttons shown | — |
| 5.1.2 | Connect wallet | Click connector (MetaMask/WalletConnect/etc.) | Wallet connects, shows connected address | — |
| 5.1.3 | Link wallet | Click "Link This Wallet" when connected | Signs message `Link wallet to Cireta account: <nonce>`, wallet appears in list | DB: `wallets` row with address, signature verified |
| 5.1.4 | Wallet appears in list | After linking | Shows truncated address, "Linked <date>", Primary badge if first | — |
| 5.1.5 | Link second wallet | Connect different wallet, link | Two wallets in list, first is Primary | DB: 2 wallet rows |
| 5.1.6 | Set primary | Click "Set Primary" on non-primary wallet | Wallet becomes primary, previous loses badge | DB: `is_primary` toggled |
| 5.1.7 | Remove wallet | Click "Remove" on non-primary | Wallet disappears from list | DB: wallet row deleted or unlinked |
| 5.1.8 | Cannot remove primary | Primary wallet | No "Remove" button shown for primary | — |
| 5.1.9 | Signature rejection | User rejects MetaMask signature | Error: "Failed to link wallet" | No wallet created |
| 5.1.10 | Duplicate wallet | Link same address twice | Error message (e.g., "Wallet already linked") | — |
| 5.1.11 | Loading state | Page initial load | "Loading..." text shown | — |
| 5.1.12 | Error state | API failure | "Failed to load wallets" error | — |
| 5.1.13 | No wallet connected | Not connected | Shows connector buttons with "Connect a wallet first" message | — |
| 5.1.14 | Safe wallet detection | Link a Gnosis Safe address | Shows "Safe" badge | DB: `is_safe=true` |

### 5.2 Wallet Screening (API: `POST /api/v1/wallets/link`)

| # | Test Case | Expected Result | Backend Check |
|---|-----------|-----------------|---------------|
| 5.2.1 | Clean wallet | Screening passes | Wallet linked, `screening_status='clear'` | `wallet_screening_service` called |
| 5.2.2 | Sanctioned wallet | Screening fails | Error: wallet rejected, not linked | Screening API called, flagged |
| 5.2.3 | Screening service down | Fallback behavior | Wallet linked with `screening_status='pending'` or error | Graceful degradation |
| 5.2.4 | Invalid address format | Not 0x + 40 hex chars | 422: invalid address | — |

---

## 6. Launchpad — Explore & Project Discovery

### 6.1 Explore Page (`/explore`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 6.1.1 | Page renders | Navigate to `/explore` | "Explore Projects" title, search bar, asset type pills, status pills, project grid | — |
| 6.1.2 | Projects load | On mount | API called: `GET /api/v1/sales?page=1&size=20`, grid populates | — |
| 6.1.3 | Loading state | While fetching | 6 skeleton placeholder cards with pulse animation | — |
| 6.1.4 | No results | All filters return empty | "No Projects Found" with search icon, "Try adjusting your filters" text, "Clear Filters" button | — |
| 6.1.5 | API error | API returns 500 | "Projects Loading Soon" with refresh button | — |
| 6.1.6 | Search filter | Type "gold" in search bar | Only projects matching "gold" shown | API re-fetched with `search=gold` |
| 6.1.7 | Asset type filter — Gold | Click "Gold" pill | Only gold projects, pill highlighted with darkAqua bg | — |
| 6.1.8 | Asset type filter — All | Click "All" | All projects shown | — |
| 6.1.9 | Status filter — Active | Click "Active" | Only active sales | — |
| 6.1.10 | Status filter — Upcoming | Click "Upcoming" | Only upcoming sales | — |
| 6.1.11 | Status filter — Completed | Click "Completed" | Only finalized/completed sales | — |
| 6.1.12 | Combined filters | Search "gold" + Asset "Commodities" + Status "Active" | Intersection of all filters | — |
| 6.1.13 | Clear filters | Click "Clear Filters" from no-results state | Search cleared, all pills reset to "All" | — |
| 6.1.14 | Result count | After filtering | Shows "Showing X projects" | — |
| 6.1.15 | Project card click | Click any project card | Navigates to `/project/<slug>` | — |
| 6.1.16 | Project card content | Each card | Shows title, asset type badge, status badge, progress bar, raised/target amounts, issuer name | — |
| 6.1.17 | Refresh button | Click Refresh on error state | Re-fetches projects | — |
| 6.1.18 | Navbar present | Page load | Navbar with light variant rendered at top | — |
| 6.1.19 | Footer present | Scroll down | Footer rendered | — |
| 6.1.20 | Sticky filters | Scroll down | Filter bar sticks to top (sticky top-0 z-30) | — |
| 6.1.21 | Filter pills scroll | On mobile | Asset type pills scroll horizontally | — |
| 6.1.22 | Status filters hidden on mobile | < lg breakpoint | Status filter pills hidden | — |

---

## 7. Launchpad — Project Detail Page

### 7.1 Project Detail (`/project/[slug]`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 7.1.1 | Page loads | Navigate to `/project/cireta-gold` | Hero section + content tabs + invest sidebar | API: `getProject(slug)` + `getSaleRawBySlug(slug)` |
| 7.1.2 | Loading state | While fetching | Full-screen spinner (Spinner size="xl") | — |
| 7.1.3 | Project not found | Navigate to `/project/nonexistent` | "Project Not Found" with "Back to Explore" link | API 404 |
| 7.1.4 | Hero section | Page loaded | Project image, asset type badge, status badge, title, issuer name, progress bar, raised/target, investor count, price/token, symbol | — |
| 7.1.5 | Back to Explore | Click "← Back to Explore" | Navigates to `/explore` | — |
| 7.1.6 | Progress bar | Active sale with raised < target | Progress bar shows correct percentage | — |

### 7.2 Tabs

| # | Tab | Test Case | Expected Content |
|---|-----|-----------|------------------|
| 7.2.1 | Overview (default) | Click or default | "About This Project" description, "Key Features" grid (ERC-3643, Chainlink PoR, KYC Required, Vesting Schedule) |
| 7.2.2 | Phases | Click "Phases" | PhaseTimeline + PhaseCard for each phase with price, allocation, min/max contribution, start/end times, active badge |
| 7.2.3 | Documents | Click "Documents" | Whitepaper, Legal Framework, Audit Report — all "Coming soon" badges |
| 7.2.4 | Team | Click "Team" | Issuer company name, "Verified" badge |
| 7.2.5 | Financials | Click "Financials" | Fundraising Summary (Total Raised, Soft Cap, Hard Cap), Fee Structure (2.5% platform fee, net proceeds), Cap Table per phase |
| 7.2.6 | Token Details | Click "Token Details" | Token name/symbol, ERC-3643 standard, Base network, decimals, total supply, contract address (link to BaseScan or "Not deployed"), compliance modules (Identity Registry, Country Restrictions, Max Token Balance, Transfer Cooldown), Transfer Restrictions section |
| 7.2.7 | Paused token warning | Token is paused | Red warning: "This token is currently paused. Transfers are disabled." |
| 7.2.8 | Contract address link | Token deployed | Truncated address links to `https://basescan.org/address/<addr>` in new tab |
| 7.2.9 | Tab highlight | Click any tab | Active tab has darkAqua bg + white text, others are white bg |
| 7.2.10 | Tab scroll | On mobile | Tabs scroll horizontally |

### 7.3 Invest Sidebar

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 7.3.1 | Sidebar renders | Page load | Shows project name, token symbol, price per token, min/max contribution, progress bar |
| 7.3.2 | Not KYC verified | User has `kyc_level < 2` | Shows "KYC Required (Level 2)" prompt with "Start KYC" button |
| 7.3.3 | Wallet not connected | No wallet connected | Shows "Connect Wallet" button |
| 7.3.4 | Ready to invest | KYC verified + wallet connected | "Invest" button enabled |
| 7.3.5 | Start KYC button | Click | Navigates to `/verify` |
| 7.3.6 | Connect Wallet button | Click | Opens RainbowKit connect modal |

---

## 8. Launchpad — Investment Flow

### 8.1 Invest Page (`/invest/[slug]`)

#### Step 1: Amount

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 8.1.1 | Page loads | Navigate to `/invest/cireta-gold` | Loading spinner → project info + amount input | API calls: `getProject`, `getSaleRawBySlug` |
| 8.1.2 | Project not found | Invalid slug | "Project not found" with back to explore link | — |
| 8.1.3 | Progress indicator | Step 1 active | 3-step progress: Amount (active), Approve, Confirm | — |
| 8.1.4 | Amount step renders | Step 1 | `InvestAmountStep` component with amount input, active phase info | — |
| 8.1.5 | Not connected | Wallet not connected | "Connect Wallet" button shown instead of continue | — |
| 8.1.6 | Connect wallet | Click connect button | Opens RainbowKit connect modal | — |
| 8.1.7 | Enter valid amount | Type `1000` | Continue button enabled, tokens to receive calculated (`1000 / $0.10 = 10,000`) | — |
| 8.1.8 | Below minimum | Type `50` (min is $100) | Continue disabled or error message | — |
| 8.1.9 | Above maximum | Type `60000` (max is $50,000) | Error or disabled | — |
| 8.1.10 | Zero amount | Type `0` | Continue disabled | — |
| 8.1.11 | Negative amount | Type `-100` | Rejected | — |
| 8.1.12 | Non-numeric | Type `abc` | Input rejects or shows NaN | — |
| 8.1.13 | Continue | Click with valid amount | Advances to Approve step (step 2) | — |

#### Step 2: Approve (USDC ERC-20 Approval)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 8.1.14 | Approve step renders | Step 2 active | Shows amount, "Approve USDC" button | — |
| 8.1.15 | Click Approve | Click approve button | Calls `writeApprove` with USDC address, sale contract, amount in 6 decimals | On-chain: USDC.approve(saleContract, amount) |
| 8.1.16 | Approve loading | Tx pending | Button shows loading state (`isApproving=true`) | — |
| 8.1.17 | Approve confirmed | Tx mined | Automatically advances to Confirm step (step 3) | On-chain: allowance set |
| 8.1.18 | User rejects approval | MetaMask reject | Error shown | — |
| 8.1.19 | Sale not deployed | `contract_address` is null | Error: "Sale contract not deployed yet." | — |

#### Step 3: Confirm (On-Chain Contribute)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 8.1.20 | Confirm step renders | Step 3 active | Shows project name, USDC amount, tokens to receive, "Confirm Investment" button | — |
| 8.1.21 | Click Confirm | Click confirm | Calls `Sale.contribute(phaseIndex, amount)` on-chain | On-chain tx submitted |
| 8.1.22 | Confirm loading | Tx pending + confirming | Button disabled, loading state | — |
| 8.1.23 | Confirm success | Tx mined | Backend recording: `POST /api/v1/sales/{id}/contribute`, advance to Success step | DB: contribution recorded |
| 8.1.24 | Backend recording fails | On-chain tx succeeds but backend POST fails | Still shows success (on-chain is source of truth) | Backend can retry later |
| 8.1.25 | User rejects tx | MetaMask reject | Error: "Transaction was rejected in your wallet." | — |
| 8.1.26 | Insufficient USDC | Not enough balance | Error: "Insufficient USDC balance." | — |
| 8.1.27 | KYC required revert | Wallet not KYC-registered on-chain | Error: "Your wallet is not KYC-verified. Please complete identity verification first." | — |
| 8.1.28 | Not whitelisted revert | Wallet not whitelisted | Error: "Your wallet is not whitelisted for this sale phase." | — |
| 8.1.29 | Below min revert | Amount below phase minimum | Error: "Amount is below the minimum contribution for this phase." | — |
| 8.1.30 | Exceeds max revert | Amount above phase maximum | Error: "Amount exceeds the maximum contribution limit." | — |
| 8.1.31 | Exceeds hard cap revert | Would push total over hard cap | Error: "This contribution would exceed the sale's hard cap." | — |
| 8.1.32 | Phase not started revert | Phase hasn't begun | Error: "This sale phase has not started yet." | — |
| 8.1.33 | Phase ended revert | Phase expired | Error: "This sale phase has ended." | — |
| 8.1.34 | Exceeds allocation revert | Phase fully subscribed | Error: "This phase's token allocation is fully subscribed." | — |
| 8.1.35 | Exceeds block limit revert | Too many txs in block | Error: "Too many contributions in this block. Please try again shortly." | — |
| 8.1.36 | Invalid phase revert | Bad phase index | Error: "Invalid sale phase." | — |
| 8.1.37 | Generic revert | Unknown revert | Error: "Transaction failed. Please try again." | — |

#### Step 4: Success

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 8.1.38 | Success renders | After confirmed contribute | `InvestSuccessStep` with project name, amount, tokens to receive, tx hash |
| 8.1.39 | View on BaseScan | Click "View on BaseScan" | Opens `https://basescan.org/tx/<hash>` in new tab |
| 8.1.40 | View Portfolio | Click "View Portfolio" | Navigates to `/portfolio` |
| 8.1.41 | Explore More | Click "Explore More" | Navigates to `/explore` |
| 8.1.42 | No progress bar | On success step | Progress bar hidden |
| 8.1.43 | No back arrow | On success step | "Back to Project" link hidden |

---

## 9. Launchpad — Portfolio

### 9.1 Portfolio Overview (`/portfolio`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 9.1.1 | Page renders — authenticated | Navigate | DashboardLayout with "Portfolio" title, 4 stat cards, holdings table | API: `GET /api/v1/portfolio` |
| 9.1.2 | Stat cards | Data loaded | Total Portfolio Value, Total Invested, Unrealised P&L (with ▲/▼), Active Positions | Calculated from portfolio data |
| 9.1.3 | P&L positive | Value > invested | Green "▲ vs. cost basis" | — |
| 9.1.4 | P&L negative | Value < invested | Red "▼ vs. cost basis" | — |
| 9.1.5 | Holdings table | Holdings exist | Table with token name, symbol, balance, value, claimable amounts | — |
| 9.1.6 | Empty holdings | No investments | PortfolioTable shows empty state | — |
| 9.1.7 | Loading state | While fetching | Spinner in stats area | — |
| 9.1.8 | Error state | API fails | "Could not load portfolio. Please try again later." | — |
| 9.1.9 | Not authenticated | Not logged in | "Sign in to view your portfolio" message | — |

### 9.2 Holdings Page (`/portfolio/holdings`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 9.2.1 | Page renders | Navigate | "Holdings" title, Refresh button, holdings table |
| 9.2.2 | Holdings table | Data loaded | Columns: Token (name, symbol, asset_type badge), Balance, Value (USD), Claimable |
| 9.2.3 | Claimable > 0 | Tokens available | Green claimable amount shown |
| 9.2.4 | Claimable = 0 | None available | Dash "—" shown |
| 9.2.5 | No holdings | Empty portfolio | Empty state: Coins icon, "No holdings yet", "Invest in a token sale to see your holdings here." |
| 9.2.6 | Loading state | Fetching | Spinner (size="lg") |
| 9.2.7 | Error state | API fail | Error message + "Retry" button |
| 9.2.8 | Refresh button | Click | Re-fetches data, icon spins while loading |
| 9.2.9 | Refresh disabled | While loading | Refresh button disabled |

---

## 10. Launchpad — Token Claiming & Vesting

### 10.1 Vesting Schedules (`/portfolio/vesting`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 10.1.1 | Page renders | Navigate | "Vesting Schedules" title, Refresh button, schedule cards |
| 10.1.2 | Schedule card | Data loaded | Token name, symbol, sale_mode, cliff status badge, progress bar (claimed/total), grid: Total, Claimed, Claimable Now, Vesting End |
| 10.1.3 | Cliff passed | `cliff_end <= now` | Badge: "Cliff passed" (success variant) |
| 10.1.4 | Cliff pending | `cliff_end > now` | Badge: "Cliff pending" (pending variant) |
| 10.1.5 | Claim button | Claimable > 0 + vault_address exists | "Claim X tokens" button shown |
| 10.1.6 | No claim button | Claimable = 0 or no vault_address | Button not shown |
| 10.1.7 | Claim — vested mode | Click claim, vault_address exists | Calls `CiretaVault.claim()` on-chain |
| 10.1.8 | Claim — direct mode | No vault_address, sale contract exists | Calls `Sale.claimTokens()` on-chain |
| 10.1.9 | Claim loading | Tx pending | Button shows "Claiming..." |
| 10.1.10 | Claim success | Tx confirmed | `claimable_amount` set to 0 in UI |
| 10.1.11 | Claim error | Tx reverts | Error message under card |
| 10.1.12 | Wallet not connected | No wallet | Button disabled |
| 10.1.13 | Empty state | No schedules | Clock icon, "No vesting schedules", "Vested investments will appear here after purchase." |
| 10.1.14 | Loading state | Fetching | Spinner |
| 10.1.15 | Error state | API fail | Error + Retry button |

### 10.2 Claim Token Page (`/portfolio/claim/[token]`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 10.2.1 | Page loads | Navigate with valid token ID | VestingCard with claim info, or failed-sale refund card | API: `getVesting(token)` + sale status check |
| 10.2.2 | Loading state | Fetching | Spinner |
| 10.2.3 | No schedule found | Invalid token | "No vesting schedule found" |
| 10.2.4 | Back to Portfolio | Click "← Back to Portfolio" | Navigates to `/portfolio` |
| 10.2.5 | Claim — vested mode | Vault address exists | Calls `CiretaVault.claim()`, then `claimVesting(schedule.id, txHash)` to backend | DB: claim recorded |
| 10.2.6 | Claim — direct mode | Sale contract, no vault | Calls `Sale.claimTokens()`, then `claimVesting()` | DB: claim recorded |
| 10.2.7 | Claim success | Tx confirmed + backend recorded | Success screen: "Tokens Claimed!" with amount + symbol, "Back to Portfolio" button |
| 10.2.8 | Backend recording fails | On-chain ok, backend POST fails | Still shows success with fallback amount |
| 10.2.9 | Wallet not connected | No wallet | Error: "Please connect your wallet first" |
| 10.2.10 | No contract address | Neither vault nor sale address | Error: "No contract address available for claiming" |
| 10.2.11 | User rejects tx | MetaMask reject | Error: "Transaction rejected" |
| 10.2.12 | Tx fails | Contract reverts | Error: "Transaction failed — check your wallet and try again" |
| 10.2.13 | Confirming state | Tx submitted, awaiting confirmation | "Confirming on-chain…" text |

### 10.3 Refund Flow (Failed Sale)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 10.3.1 | Failed sale detected | Sale status is `failed`/`finalized_failed`/`refunds_enabled` | Shows refund card with warning icon: "Sale Did Not Reach Soft Cap" |
| 10.3.2 | Claim Refund | Click "Claim Refund" | Calls `Sale.claimRefund()` on-chain |
| 10.3.3 | Refund loading | Tx pending | "Processing Refund..." |
| 10.3.4 | Refund success | Tx confirmed | Success screen: "Refund Claimed!" with "Your USDC refund has been sent to your wallet." |
| 10.3.5 | Backend recording | After refund | `POST /api/v1/sales/{token_id}/refund?tx_hash=<hash>` called |
| 10.3.6 | Refund confirming | Awaiting block | "Confirming on-chain…" text |

---

## 11. Launchpad — Dividend Claims

### 11.1 Dividends Page (`/portfolio/dividends`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 11.1.1 | Page renders | Navigate | "Dividend Claims" title, Refresh button, dividend entries |
| 11.1.2 | Dividend entry | Data loaded | Token name, symbol, total earned, claimable USDC |
| 11.1.3 | Claimable > 0 | Has unclaimed dividends | Green claimable amount + "Claim" button |
| 11.1.4 | All claimed | Claimable = 0 | Checkmark icon + "All claimed" |
| 11.1.5 | Claim button | Click "Claim" | Calls `DividendDistributor.claim()` on contract_address on-chain |
| 11.1.6 | Claim loading | Tx pending | Button shows "Claiming..." |
| 11.1.7 | Claim success | Tx confirmed | `claimable_usdc` set to 0 in UI for that entry |
| 11.1.8 | User rejects tx | MetaMask reject | Error: "Transaction rejected" |
| 11.1.9 | Claim fails | Tx reverts | Error: "Claim failed — check your wallet and try again" |
| 11.1.10 | Wallet not connected | No wallet | Error: "Please connect your wallet first" |
| 11.1.11 | No contract address | `contract_address` null | Claim button disabled |
| 11.1.12 | Confirming state | Awaiting block | "Confirming on-chain…" text |
| 11.1.13 | Empty state | No dividends | Coins icon, "No dividend distributions available", "Dividends appear here when issuers distribute revenue to token holders." |
| 11.1.14 | Loading state | Fetching | Spinner |
| 11.1.15 | Error state | API fails | Error + Retry button |
| 11.1.16 | Refresh button | Click | Re-fetches, icon spins |

---

## 12. Launchpad — Redemptions

### 12.1 Redeem Token Page (`/portfolio/redeem/[token]`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 12.1.1 | Page loads | Navigate with valid token | Shows token name, symbol, balance, amount input, method selector | API: `getPortfolio()` to find holding |
| 12.1.2 | Loading state | Fetching | Spinner |
| 12.1.3 | Token not found | Invalid token ID | "Token not found in portfolio" |
| 12.1.4 | Enter amount | Type "500" | Summary shows tokens to burn + method |
| 12.1.5 | Redeem Max | Click "Redeem Max" | Amount field set to full balance |
| 12.1.6 | Fulfillment method — cash | Click "Cash Settlement" | Selected with highlighted border |
| 12.1.7 | Fulfillment method — physical | Click "Physical Delivery" | Selected with highlighted border |
| 12.1.8 | Summary display | Amount > 0 | Shows "Tokens to Burn: X SYMBOL" and "Method: Cash/Physical" |
| 12.1.9 | Submit redemption | Click "Submit Redemption" with valid amount | Success screen: "Redemption Submitted" | DB: `redemption_requests` row created with status `pending` |
| 12.1.10 | Submit — zero amount | Amount = 0 | Button disabled |
| 12.1.11 | Submit — exceeds balance | Amount > balance | Button disabled |
| 12.1.12 | Submit — negative | Negative amount | Button disabled |
| 12.1.13 | Loading while submitting | Click submit | Spinner in button |
| 12.1.14 | Cancel button | Click "Cancel" | Navigates to `/portfolio` |
| 12.1.15 | Back to Portfolio (success) | Click from success screen | Navigates to `/portfolio` |
| 12.1.16 | Back link | Click "← Back to Portfolio" | Navigates to `/portfolio` |

---

## 13. Launchpad — Transaction History

### 13.1 Transactions Page (`/portfolio/transactions`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 13.1.1 | Page renders | Navigate | "Transaction History" title, Refresh button, table |
| 13.1.2 | Table columns | Data loaded | Date, Type, Amount (USDC), Status, Tx link |
| 13.1.3 | Type labels | Various types | "Investment", "Redemption", "Claim", "Refund", "Dividend" |
| 13.1.4 | Status badges | Various statuses | confirmed/claimed → green, pending → yellow, failed → red |
| 13.1.5 | Tx hash link | Has tx_hash (not starting with "otc-") | External link icon, opens BaseScan tx |
| 13.1.6 | OTC tx hash | tx_hash starts with "otc-" | No external link shown |
| 13.1.7 | No tx hash | tx_hash null | No link column content |
| 13.1.8 | Empty state | No transactions | Receipt icon, "No transactions yet", "Your on-chain transactions will appear here after you invest." |
| 13.1.9 | Loading state | Fetching | Spinner |
| 13.1.10 | Error state | API fails | Error + Retry button |
| 13.1.11 | Refresh button | Click | Re-fetches data |
| 13.1.12 | Date format | Has created_at | Formatted as locale date |
| 13.1.13 | No date | created_at null | Shows "—" |

---

## 14. Launchpad — Settings

### 14.1 Profile Settings (`/settings/profile`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 14.1.1 | Page loads | Navigate | Email (read-only), display name input, KYC status badge, linked wallets list | API: `me()` + `listWallets()` |
| 14.1.2 | Email shown | Loaded | Email displayed, note: "Email cannot be changed after verification." |
| 14.1.3 | Display name edit | Change name, click "Save Changes" | Button shows "Saving..." → "Saved ✓" for 2 seconds | API: `PATCH /api/v1/auth/me` |
| 14.1.4 | Save error | API fails | Error: "Failed to save profile." |
| 14.1.5 | KYC status display | Various levels | Badge with level + status (e.g., "Level 2 — approved") |
| 14.1.6 | Linked wallets | Wallets exist | Shows truncated addresses with Primary/screening badges |
| 14.1.7 | No wallets | None linked | "No wallets linked. Go to Settings > Wallets to link one." |
| 14.1.8 | Loading state | Fetching | Spinner |
| 14.1.9 | Error — no user | API fails completely | Error message + Retry button |

### 14.2 Verification Settings (`/settings/verification`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 14.2.1 | Page loads | Navigate | Status overview with shield icon, KYC tier, investor type, country, expiry date |
| 14.2.2 | Approved status | KYC approved | Green shield icon, "Verified" heading, "approved" badge |
| 14.2.3 | Pending status | KYC pending | Yellow shield, "Verification Pending", "pending" badge, informational text |
| 14.2.4 | Not verified | KYC none | Gray shield, "Not Verified", "Start Verification" button → `/verify` |
| 14.2.5 | Expired KYC | Past expiry date | Red warning: "Verification Expired" + "Re-verify Identity" button → `/verify` |
| 14.2.6 | Rejected KYC | KYC rejected | "Re-verify Identity" button → `/verify` |
| 14.2.7 | Tier labels | Level 0–3 | "Unverified", "Basic (Tier 1)", "Standard (Tier 2)", "Enhanced (Tier 3)" |
| 14.2.8 | Expiry date display | Has expiry | Formatted date, red text if expired |
| 14.2.9 | No expiry | No expiry_date | "No expiry" |
| 14.2.10 | Loading state | Fetching | Spinner |
| 14.2.11 | Error state | API fails | Error + Retry button |

### 14.3 Notification Settings (`/settings/notifications`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 14.3.1 | Page loads | Navigate | Grid: Category / Email / In-App toggles for 4 categories | API: `GET /api/v1/notifications/preferences` |
| 14.3.2 | Categories shown | Loaded | Investment confirmations, KYC reminders, Sale updates, Dividend notifications |
| 14.3.3 | Toggle email | Click email toggle for any category | Toggle state changes visually | — |
| 14.3.4 | Toggle in-app | Click in-app toggle | Toggle state changes | — |
| 14.3.5 | Save preferences | Click "Save Preferences" | "Saving..." → "Saved ✓" | API: `PATCH /api/v1/notifications/preferences` |
| 14.3.6 | Save error | API fails | Error message shown |
| 14.3.7 | Security note | Always shown | "Security alerts are always enabled and cannot be disabled." |
| 14.3.8 | Loading state | Fetching | Spinner |
| 14.3.9 | API not available | Endpoint doesn't exist yet | Falls back to defaults gracefully |
| 14.3.10 | Toggle ARIA | Each toggle | Has `role="switch"` and `aria-checked` attributes |

---

## 15. Launchpad — Account Page

### 15.1 Account Page (`/account`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 15.1.1 | Page loads | Navigate | 4 tabs: Profile, Wallets, Notifications, Security |
| 15.1.2 | Not logged in | No auth | "Please log in" message |
| 15.1.3 | Loading state | Fetching | Spinner |

#### Profile Tab
| 15.1.4 | Email display | Profile tab active | Email with "Verified" badge |
| 15.1.5 | KYC status | KYC approved | KYCBadge component with level + status, "View Details" button |
| 15.1.6 | Export data | Click "Export to CSV" | (Stub) Triggers CSV download |

#### Wallets Tab
| 15.1.7 | Connected wallets | Wallets tab | Shows onchain_id with Primary badge, or "No wallet connected yet" |
| 15.1.8 | Add Wallet button | Click "Add Wallet" | (Stub) Opens wallet connection flow |

#### Notifications Tab
| 15.1.9 | Preferences | Notifications tab | Toggle switches for Email, Sale Updates, Vesting Reminders, Marketing |

#### Security Tab
| 15.1.10 | Change password form | Security tab | Current password, new password, confirm new password fields, "Update Password" button |
| 15.1.11 | 2FA section | Below password | "Add an extra layer of security" description, "Enable 2FA" button |
| 15.1.12 | Danger Zone | Bottom | Red section: "Once you delete your account, there is no going back." + "Delete Account" button |

---

## 16. Launchpad — Notifications

### 16.1 Notification Endpoints

| # | Test Case | Expected Result | Backend Check |
|---|-----------|-----------------|---------------|
| 16.1.1 | List notifications | `GET /api/v1/notifications` | Returns user's notifications with read/unread status |
| 16.1.2 | Mark as read | `PATCH /api/v1/notifications/{id}/read` | Notification `read=true` |
| 16.1.3 | Mark all read | `POST /api/v1/notifications/mark-all-read` | All notifications `read=true` |
| 16.1.4 | Notification types | Various triggers | `investment_confirmed`, `kyc_approved`, `kyc_rejected`, `sale_finalized`, `dividend_available`, `vesting_unlocked`, `kyc_expiry_warning` |
| 16.1.5 | In-app + email | Based on preferences | Both in-app notification created AND email sent if preference enabled |

---

## 17. Admin — Authentication

### 17.1 Admin Login (`/login`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 17.1.1 | Page renders | Navigate to admin `/login` | "Cireta Admin" title, dark theme, email/password fields, "Sign In" button | — |
| 17.1.2 | Valid admin login | Enter admin credentials, submit | Redirect to `/` → `/issuer/overview` | httpOnly cookie set via Next.js route handler `/api/auth/login` |
| 17.1.3 | Wrong credentials | Invalid email/password | Error message displayed | — |
| 17.1.4 | Loading state | Submit | Button shows "Signing in...", disabled | — |
| 17.1.5 | Non-admin user | Login with investor credentials | Error or limited access | Role check |
| 17.1.6 | Root redirect | Navigate to admin `/` | Redirect to `/issuer/overview` | — |

---

## 18. Admin — Issuer Dashboard Overview

### 18.1 Overview Page (`/issuer/overview`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 18.1.1 | Page renders | Navigate | IssuerDashboardLayout with title, stats grid, quick actions, active sales | API: `getSales()` |
| 18.1.2 | Stats cards | Data loaded | Total Raised, Active Sales, Total Investors, Fees Earned |
| 18.1.3 | Quick action — Create Token | Click | Navigates to `/issuer/tokens/new` |
| 18.1.4 | Quick action — Start Sale | Click | Navigates to `/issuer/sales/new` |
| 18.1.5 | Quick action — Compliance | Click | Navigates to `/issuer/compliance` |
| 18.1.6 | Active sales list | Sales with status "active" | Shows sale name, symbol, raised amount, progress bar, percentage |
| 18.1.7 | No active sales | None active | "No active sales yet" |
| 18.1.8 | View All link | Click "View All" | Navigates to `/issuer/sales` |
| 18.1.9 | Loading state | Fetching | Spinner in sales area |

---

## 19. Admin — Token Management

### 19.1 Token List (`/issuer/tokens`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 19.1.1 | Page renders | Navigate | DataTable with columns: Token (name, symbol, asset_type), Supply, Contract, Status, Manage button |
| 19.1.2 | Not deployed | Contract is null | Badge: "Not deployed" (pending) |
| 19.1.3 | Deployed | Has contract address | Truncated address code block |
| 19.1.4 | Paused status | `is_paused=true` | Badge: "Paused" (pending) |
| 19.1.5 | Active status | `is_paused=false` | Badge: "Active" (active) |
| 19.1.6 | Search filter | Type token name/symbol | Table filters |
| 19.1.7 | Manage button | Click | Navigates to `/issuer/tokens/{id}` |
| 19.1.8 | Create New Token | Click button | Navigates to `/issuer/tokens/new` |
| 19.1.9 | Loading state | Fetching | Spinner |

### 19.2 Create Token (`/issuer/tokens/new`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 19.2.1 | Page renders | Navigate | 4-step wizard: Token Details, Documentation, Compliance, Deploy |
| 19.2.2 | Step 1 — Token Details | Fill name, symbol, asset type, supply, decimals, description | Form accepts values | — |
| 19.2.3 | Step navigation | Click Next/Back | Steps advance/retreat, progress indicator updates | — |
| 19.2.4 | Step 3 — Compliance modules | Toggle compliance modules | `country_allow` and `max_ownership` pre-selected | — |
| 19.2.5 | Step 4 — Deploy | Click deploy button | Creates token in backend, then deploys on-chain | API: `POST /api/v1/tokens` → `POST /api/v1/tokens/{id}/deploy` |
| 19.2.6 | Deploy loading | While deploying | `isDeploying=true`, button disabled | — |
| 19.2.7 | Deploy success | Token deployed | Success state shown | DB: token row with contract_address |
| 19.2.8 | Deploy error | Deployment fails | Error message: deploy error text | — |
| 19.2.9 | Empty name | Submit with empty name | Validation prevents | — |
| 19.2.10 | Empty symbol | Submit with empty symbol | Validation prevents | — |

### 19.3 Token Detail (`/issuer/tokens/[id]`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 19.3.1 | Page loads | Navigate with valid ID | Token details: name, symbol, asset type, supply, contract address, status | API: `getToken(id)` |
| 19.3.2 | Token not found | Invalid ID | "Token not found" |
| 19.3.3 | Pause token | Click pause button (Play/Pause icon) | Calls `pauseToken(id, reason)` | API: `POST /api/v1/admin/compliance/pause-token`, on-chain: token paused |
| 19.3.4 | Unpause token | Click unpause when paused | Calls `unpauseToken(id, reason)` | API: `POST /api/v1/admin/compliance/unpause-token`, on-chain: token unpaused |
| 19.3.5 | Toggle loading | While toggling | `toggling=true`, button disabled |
| 19.3.6 | Back to Tokens | Click "← Back to Tokens" | Navigates to `/issuer/tokens` |

---

## 20. Admin — Sale Management

### 20.1 Sale List (`/issuer/sales`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 20.1.1 | Page renders | Navigate | DataTable: Sale (name, symbol), Status badge, Raised (amount + progress bar + percentage), View button |
| 20.1.2 | Status badges | Various | active → active badge, finalized → default, draft → pending |
| 20.1.3 | Search filter | Type sale name | Filters table |
| 20.1.4 | Create New Sale | Click button | Navigates to `/issuer/sales/new` |
| 20.1.5 | View button | Click | Navigates to `/issuer/sales/{id}` |
| 20.1.6 | Loading state | Fetching | Spinner |

### 20.2 Sale Detail (`/issuer/sales/[id]`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 20.2.1 | Page loads | Navigate with valid ID | Stat cards (Total Raised, Hard Cap, Soft Cap), progress bar, status badge, phase details | API: `getSale(id)` |
| 20.2.2 | Sale not found | Invalid ID | "Sale not found" |
| 20.2.3 | Progress calculation | raised / hard_cap * 100 | Correct percentage shown |
| 20.2.4 | Status display | Various | Correct badge variant and text |
| 20.2.5 | Back to Sales | Click | Navigates to `/issuer/sales` |
| 20.2.6 | Loading state | Fetching | Spinner |
| 20.2.7 | OTC link | If available | Link to `/issuer/sales/{id}/otc` |

---

## 21. Admin — OTC Allocations

### 21.1 OTC Page (`/issuer/sales/[id]/otc`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 21.1.1 | Page renders | Navigate | "OTC Allocation" title, form + existing records | API: `GET /api/v1/sales/{id}/contributions?is_otc=true` |
| 21.1.2 | Submit OTC allocation | Fill wallet, amount, payment ref, click submit | Success: "OTC allocation recorded successfully." | API: `POST /api/v1/sales/{id}/otc`, DB: contribution with OTC flag |
| 21.1.3 | Missing wallet | Submit without wallet | `required` prevents |
| 21.1.4 | Missing amount | Submit without amount | `required` prevents |
| 21.1.5 | Missing payment ref | Submit without ref | `required` prevents |
| 21.1.6 | Optional notes | Leave notes blank | Submits OK |
| 21.1.7 | Error | API fails | Error message shown |
| 21.1.8 | OTC records | Records exist | Shows wallet, tokens, reference, date |
| 21.1.9 | No records | Empty | "No OTC records" (empty table) |
| 21.1.10 | Back to Sale | Click back link | Navigates to `/issuer/sales/{id}` |
| 21.1.11 | Form clears after success | Submit successfully | All fields reset |

---

## 22. Admin — Investor Management

### 22.1 Investors List (`/issuer/investors`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 22.1.1 | Page renders | Navigate | Stats (Total, KYC Verified, Pending KYC), DataTable with investors |
| 22.1.2 | Table columns | Data loaded | Investor (email, truncated ID), KYC (KYCBadge), Wallet (WalletBadge), Joined date |
| 22.1.3 | Search | Type email or wallet address | Filters table |
| 22.1.4 | Empty wallet | Investor without wallet | Dash "—" |
| 22.1.5 | Loading state | Fetching | Spinner |
| 22.1.6 | Row click | Click investor row | Navigates to `/issuer/investors/{id}` |

### 22.2 Investor Detail (`/issuer/investors/[id]`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 22.2.1 | Page loads | Navigate | Grid: Email, KYC Status, Country, Investor Type, Total Invested, Status (Active/Frozen), wallet addresses |
| 22.2.2 | Investor not found | Invalid ID | "Investor not found." |
| 22.2.3 | Frozen status | `is_frozen=true` | Red "Frozen" badge |
| 22.2.4 | Active status | `is_frozen=false` | Green "Active" badge |
| 22.2.5 | Freeze action | Click Freeze button | `window.confirm()` dialog → `POST /api/v1/admin/compliance/freeze` | Audit log created |
| 22.2.6 | No wallet to freeze | No wallet addresses | Error: "No wallet to freeze" |
| 22.2.7 | Action feedback | After freeze | Success/error message shown |
| 22.2.8 | Back link | Click | Navigates to `/issuer/investors` |
| 22.2.9 | Loading state | Fetching | "Loading..." |

---

## 23. Admin — Compliance Actions

### 23.1 Compliance Dashboard (`/issuer/compliance`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 23.1.1 | Page renders | Navigate | 4 action cards + audit log | API: `getAuditLogs()` |
| 23.1.2 | Action cards | Displayed | Freeze (red), Unfreeze (green), Forced Transfer (yellow), Recover (purple) |

#### Freeze Action
| 23.1.3 | Open freeze modal | Click Freeze card | Modal opens with target address + reason fields |
| 23.1.4 | Submit freeze | Fill address + reason, submit | Success: "freeze action completed successfully." | API: `POST /api/v1/admin/compliance/freeze`, audit log refreshed |
| 23.1.5 | Missing address | Submit without address | Submit prevented (button check) |
| 23.1.6 | Missing reason | Submit without reason | Submit prevented |
| 23.1.7 | Freeze error | API fails | Error message shown, clears after 5s |

#### Unfreeze Action
| 23.1.8 | Submit unfreeze | Fill address + reason | Success: "unfreeze action completed successfully." | API: `POST /api/v1/admin/compliance/unfreeze` |

#### Forced Transfer
| 23.1.9 | Open forced transfer modal | Click card | Modal with token_id, from, to, amount, reason fields |
| 23.1.10 | Submit forced transfer | Fill all fields | Success | API: `POST /api/v1/admin/compliance/forced-transfer`, on-chain tx |
| 23.1.11 | Missing destination | Submit without to_address | Prevented |

#### Recover Tokens
| 23.1.12 | Submit recovery | Fill token_id, from, amount, reason | Success | API: `POST /api/v1/admin/compliance/recover` |

#### Audit Log
| 23.1.13 | Audit log display | Actions performed | Log entries with action, target, timestamp, actor |
| 23.1.14 | Loading state | Fetching | `logsLoading=true` |
| 23.1.15 | Modal close | Click X or cancel | Modal closes, fields reset |
| 23.1.16 | Feedback auto-dismiss | After success/error | Feedback clears after 5 seconds |

### 23.2 Token Recovery Page (`/issuer/compliance/recovery`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 23.2.1 | Page renders | Navigate | Form: Lost Wallet, New Wallet, Token ID, ONCHAINID (optional), Reason. Sensitive action warning. |
| 23.2.2 | Sensitive action warning | Always shown | Yellow banner: "Ensure investor identity has been verified off-platform before proceeding." |
| 23.2.3 | Submit without confirming | Click submit first time | `confirming` state — shows confirmation dialog |
| 23.2.4 | Confirm and submit | Click again to confirm | Calls `recoverTokens()` | API: recovery endpoint, DB: audit log |
| 23.2.5 | Success | API succeeds | Green message: "Token recovery submitted successfully." |
| 23.2.6 | Error | API fails | Red error message |
| 23.2.7 | Form clears after success | Successful submit | All fields reset |
| 23.2.8 | Optional ONCHAINID | Leave blank | Submits successfully (not required) |
| 23.2.9 | Back link | Click | Navigates to `/issuer/compliance` |

---

## 24. Admin — Token Recovery

(Covered in 23.2 above)

---

## 25. Admin — Dividend Management

### 25.1 Dividends Page (`/issuer/dividends`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 25.1.1 | Page renders | Navigate | "Dividend Management" title, deposit form + distribution history | API: `listDistributions()` |
| 25.1.2 | Deposit form | Visible | Token ID, Amount (USDC), DividendDistributor Address (optional) |
| 25.1.3 | Submit deposit | Fill token_id + amount, click "Record Deposit" | Success: "Dividend deposit recorded." | API: `POST /api/v1/admin/dividends/deposit`, DB: `dividend_distributions` row |
| 25.1.4 | Missing token_id | Submit without | `required` prevents |
| 25.1.5 | Missing amount | Submit without | `required` prevents |
| 25.1.6 | Optional contract | Leave blank | Submits OK |
| 25.1.7 | Submit error | API fails | Error message |
| 25.1.8 | Loading state | Submitting | Button: "Recording..." |
| 25.1.9 | Distribution history | Records exist | Shows amount, epoch index, date |
| 25.1.10 | No distributions | Empty | "No distributions recorded yet." |
| 25.1.11 | Form clears after success | Successful submit | All fields reset |
| 25.1.12 | History refreshes | After submit | New entry appears |

---

## 26. Admin — Redemption Management

### 26.1 Redemptions Page (`/issuer/redemptions`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 26.1.1 | Page renders | Navigate | "Redemption Requests" title, list of redemptions | API: `GET /api/v1/admin/redemptions` |
| 26.1.2 | Redemption card | Data loaded | Amount, date, status badge, delivery info (name, address, phone) |
| 26.1.3 | Status badge colors | Various | fulfilled → green, shipped → blue, processing → yellow, pending → gray |
| 26.1.4 | Next status button | Click "Mark as processing" | Updates status from pending → processing | API: `PATCH /api/v1/admin/redemptions/{id}` |
| 26.1.5 | Status flow | Follow flow | pending → processing → shipped → fulfilled | DB: status updated, timestamps set |
| 26.1.6 | Shipped timestamp | Mark as shipped | `shipped_at` set | DB check |
| 26.1.7 | Fulfilled timestamp | Mark as fulfilled | `fulfilled_at` set | DB check |
| 26.1.8 | No next status | Fulfilled | No "Mark as" button |
| 26.1.9 | Cancelled | Cancelled redemption | No "Mark as" button |
| 26.1.10 | Loading state | Fetching | "Loading..." |
| 26.1.11 | No redemptions | Empty | "No redemption requests." |
| 26.1.12 | Update loading | While updating | Button disabled, shows "Updating..." |
| 26.1.13 | Delivery info display | Physical delivery | Shows name, address, phone if present |

---

## 27. Admin — Issuer Withdrawals

### 27.1 Withdrawals Page (`/issuer/withdrawals`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 27.1.1 | Page renders | Navigate | Stats (Available, Pending, Total Withdrawn), available amount display, DataTable of records | API: `getWithdrawals()` |
| 27.1.2 | Stats cards | Data loaded | Available (teal variant), Pending, Total Withdrawn |
| 27.1.3 | Available amount | Shown prominently | Large teal amount |
| 27.1.4 | Withdraw button | Click | Opens withdraw modal with amount input |
| 27.1.5 | Enter amount | Type withdrawal amount | — |
| 27.1.6 | Execute withdrawal | Confirm | Calls `executeWithdrawal()` | API: `POST /api/v1/admin/issuer/withdraw`, on-chain tx |
| 27.1.7 | Withdraw error | API fails | Error message shown |
| 27.1.8 | Withdraw loading | Processing | Loading state |
| 27.1.9 | Records table | Records exist | Columns: Amount + token, Status badge, Tx Hash (truncated), Date |
| 27.1.10 | Status badges | Various | available → active, processing → pending |
| 27.1.11 | No tx hash | Pending withdrawal | Dash "—" |
| 27.1.12 | Loading state | Fetching | Spinner |

---

## 28. Admin — Reports

### 28.1 Reports Page (`/issuer/reports`)

| # | Test Case | Action | Expected Result |
|---|-----------|--------|-----------------|
| 28.1.1 | Page renders | Navigate | 4 report types: Sales, Holders, Fees, Compliance |
| 28.1.2 | Sales Report download | Click "Download CSV" | Fetches `/api/v1/admin/issuer/reports/sales` with `Accept: text/csv`, triggers download |
| 28.1.3 | Holders Report download | Click | Downloads `cireta-holders-report.csv` |
| 28.1.4 | Fees Report download | Click | Downloads fee report |
| 28.1.5 | Compliance Report download | Click | Downloads compliance report |
| 28.1.6 | Download error | API unavailable | Error: "Failed to download X report. The endpoint may not be available yet." |
| 28.1.7 | Report descriptions | Displayed | Sales: "Per-sale breakdown of contributions, phases, and OTC", Holders: "Current cap table", etc. |

---

## 29. Platform Admin — Analytics

### 29.1 Analytics Page (`/platform/analytics`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 29.1.1 | Page renders | Navigate | PlatformAdminLayout, 4 stat cards, 4 charts, time range selector | API: `GET /api/v1/admin/platform/stats` |
| 29.1.2 | Stat cards | Data loaded | Total Value Locked, Total Users, Fee Revenue (YTD), Active Sales |
| 29.1.3 | Stats fallback | API fails | Cards show 0 |
| 29.1.4 | Time range selector | Select "Last 7 days" / "30 days" / "90 days" / "1 year" | Dropdown works |
| 29.1.5 | Charts render | Dynamic imports loaded | TVLChart, FeeRevenueChart, KYCFunnelChart, TokenDistributionChart |
| 29.1.6 | Charts — SSR safe | Server render | No SSR crash (dynamic import with ssr: false) |

---

## 30. Platform Admin — Issuer Management

### 30.1 Issuers Page (`/platform/issuers`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 30.1.1 | Page renders | Navigate | DataTable of issuers, search, status filter | API: `getIssuers()` |
| 30.1.2 | Search filter | Type issuer name/legal entity | Table filters |
| 30.1.3 | Status filter | Select "all"/"active"/"pending"/"suspended" | Filters by status |
| 30.1.4 | Approve issuer | Click approve action on pending issuer | Modal → confirm → `activateIssuer(id)` | DB: `status='active'` |
| 30.1.5 | Revoke issuer | Click revoke action | Modal with reason → confirm → `revokeIssuer(id)` | DB: `status='suspended'` |
| 30.1.6 | Update fee | Click fee action | Modal with fee BPS input → confirm → `updateIssuerFee(id, bps)` | DB: `fee_bps` updated |
| 30.1.7 | Fee validation | Enter fee > 10000 BPS | Server rejects (max 10000) | Schema: `ge=0, le=10000` |
| 30.1.8 | Fee validation | Enter negative fee | Server rejects | Schema: `ge=0` |
| 30.1.9 | Modal close | Click cancel / close | Modal closes, state resets |
| 30.1.10 | Submit loading | While processing | Button disabled |
| 30.1.11 | Action error | API fails | Console error (TODO: toast) |

---

## 31. Platform Admin — User Management

### 31.1 Users Page (`/platform/users`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 31.1.1 | Page renders | Navigate | DataTable with all users | API: `GET /api/v1/admin/platform/users` |
| 31.1.2 | Table columns | Loaded | Email, KYC Level (badge), Status (badge), Wallets count, Country, Registered date |
| 31.1.3 | KYC badges | Various levels | Level ≥ 2: success, Level 1: pending, Level 0: default |
| 31.1.4 | Status badges | Various | approved → success, pending → pending, rejected/expired → error |
| 31.1.5 | Total count | Header area | "X total users" |
| 31.1.6 | Loading state | Fetching | "Loading..." |
| 31.1.7 | Error state | API fails | "Failed to load users." red banner |

---

## 32. Platform Admin — Compliance Overview

### 32.1 Compliance Page (`/platform/compliance`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 32.1.1 | Page renders | Navigate | Stats (Frozen Addresses, Compliance Actions, Active Rules), Frozen table, Recent Actions | API: `getFrozenAddresses()` + `getAuditLogs()` |
| 32.1.2 | Stats cards | Data loaded | Counts of frozen, actions, rules |
| 32.1.3 | Frozen addresses table | Data exists | Columns: Address (truncated code), Reason, Frozen At |
| 32.1.4 | Search frozen | Type address | Filters frozen table |
| 32.1.5 | No frozen addresses | Empty | "No frozen addresses" |
| 32.1.6 | Recent actions | Audit logs exist | Shows last 10 actions |
| 32.1.7 | No actions | Empty | "No compliance actions yet" |
| 32.1.8 | Loading state | Fetching | Spinners in both sections |

---

## 33. Platform Admin — Settings

### 33.1 Settings Page (`/platform/settings`)

| # | Test Case | Action | Expected Result | Backend Check |
|---|-----------|--------|-----------------|---------------|
| 33.1.1 | Page renders | Navigate | "Platform Settings" title, 3 settings fields | API: `GET /api/v1/admin/platform/settings` |
| 33.1.2 | Default Fee Rate | Input | Shows current BPS value (e.g., "200"), helper: "100 basis points = 1%" |
| 33.1.3 | Blocked Countries | Input | Comma-separated ISO codes (e.g., "US") |
| 33.1.4 | Minimum KYC Level | Select | Level 1/2/3 dropdown |
| 33.1.5 | Save settings | Click "Save Settings" | Success: "Saved ✓" for 2 seconds | API: `PATCH /api/v1/admin/platform/settings` |
| 33.1.6 | Save error | API fails | Error message |
| 33.1.7 | Load fallback | Settings API fails | Uses defaults |

---

## 34. Smart Contract Tests

### 34.1 CiretaToken (ERC-3643 Security Token)

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.1.1 | `transfer` | KYC-verified holder → verified holder | Transfer succeeds |
| 34.1.2 | `transfer` | Unverified holder → anyone | Transfer reverts |
| 34.1.3 | `transfer` | Anyone → unverified | Transfer reverts |
| 34.1.4 | `transfer` | Frozen address sends | Transfer reverts |
| 34.1.5 | `transfer` | Token is paused | All transfers revert |
| 34.1.6 | `transfer` | Blocked country | Transfer reverts (CountryAllowModule) |
| 34.1.7 | `transfer` | Exceeds max holder count | Transfer reverts (MaxHolderCountModule) |
| 34.1.8 | `pause` | Owner calls | Token paused, Paused event emitted |
| 34.1.9 | `pause` | Non-owner calls | Reverts: not authorized |
| 34.1.10 | `unpause` | Owner calls when paused | Token unpaused |
| 34.1.11 | `freezePartialTokens` | Compliance agent | Tokens frozen for address |
| 34.1.12 | `unfreezePartialTokens` | Compliance agent | Tokens unfrozen |
| 34.1.13 | `forcedTransfer` | Agent transfers between addresses | Tokens moved, event emitted |
| 34.1.14 | `recoveryAddress` | Recovery agent | Tokens recovered from lost wallet |
| 34.1.15 | `mint` | Token agent mints | Balance increases, TotalSupply increases |
| 34.1.16 | `burn` | Token agent burns | Balance decreases |

### 34.2 Sale Contract

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.2.1 | `contribute(phaseIdx, amount)` | Valid amount, active phase, KYC'd wallet | USDC transferred, contribution recorded, event emitted |
| 34.2.2 | `contribute` | Phase not started | Reverts: "phase not started" |
| 34.2.3 | `contribute` | Phase ended | Reverts: "phase ended" |
| 34.2.4 | `contribute` | Below min contribution | Reverts: "below min" |
| 34.2.5 | `contribute` | Above max contribution | Reverts: "exceeds max" |
| 34.2.6 | `contribute` | Would exceed hard cap | Reverts: "exceeds hard cap" |
| 34.2.7 | `contribute` | Non-KYC wallet | Reverts: "KYC required" |
| 34.2.8 | `contribute` | Non-whitelisted wallet | Reverts: "not whitelisted" |
| 34.2.9 | `contribute` | Allocation fully subscribed | Reverts: "exceeds allocation" |
| 34.2.10 | `contribute` | Too many txs in same block | Reverts: "exceeds block limit" |
| 34.2.11 | `contribute` | Invalid phase index | Reverts: "invalid phase" |
| 34.2.12 | `claimTokens` | Sale finalized successfully | Tokens transferred to investor |
| 34.2.13 | `claimTokens` | Sale not finalized | Reverts |
| 34.2.14 | `claimTokens` | Already claimed | Reverts or zero |
| 34.2.15 | `claimRefund` | Sale failed (below soft cap) | USDC refunded |
| 34.2.16 | `claimRefund` | Sale succeeded | Reverts |
| 34.2.17 | `finalize` | Owner after sale end, above soft cap | Sale finalized, tokens allocated |
| 34.2.18 | `finalize` | Below soft cap | Sale marked failed, refunds enabled |
| 34.2.19 | `finalize` | Not owner | Reverts |
| 34.2.20 | `finalize` | Sale still active | Reverts |

### 34.3 CiretaTokenFactory

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.3.1 | `createToken` | Registered issuer | Token deployed, address returned, event emitted |
| 34.3.2 | `createToken` | Non-registered issuer | Reverts |
| 34.3.3 | `createToken` | Platform admin | Succeeds |

### 34.4 CiretaSaleFactory

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.4.1 | `createSale` | Valid params + issuer | Sale contract deployed |
| 34.4.2 | `createSale` | Non-issuer | Reverts |

### 34.5 IssuerRegistry

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.5.1 | `registerIssuer` | Platform admin registers | Issuer registered with fee BPS |
| 34.5.2 | `registerIssuer` | Non-admin | Reverts |
| 34.5.3 | `revokeIssuer` | Admin revokes | Issuer revoked |
| 34.5.4 | `updateFee` | Admin updates fee | Fee BPS changed |
| 34.5.5 | `isRegistered` | Check registered issuer | Returns true |
| 34.5.6 | `isRegistered` | Check unregistered | Returns false |

### 34.6 PlatformFeeManager

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.6.1 | `collectFee` | Sale finalization | Fee collected to receiver address |
| 34.6.2 | `setFeeReceiver` | Admin changes receiver | Updated |
| 34.6.3 | `setFeeReceiver` | Non-admin | Reverts |

### 34.7 RedemptionManager

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.7.1 | `requestRedemption` | Token holder with balance | Tokens burned/locked, request created |
| 34.7.2 | `requestRedemption` | Insufficient balance | Reverts |
| 34.7.3 | `fulfillRedemption` | Admin fulfills | Request status updated |

### 34.8 DividendDistributor

| # | Function | Test Case | Expected Result |
|---|----------|-----------|-----------------|
| 34.8.1 | `deposit` | Issuer deposits USDC | New epoch created, funds received |
| 34.8.2 | `claim` | Holder with balance | Proportional USDC transferred |
| 34.8.3 | `claim` | Holder already claimed epoch | Reverts or zero |
| 34.8.4 | `claim` | Non-holder | Zero payout |
| 34.8.5 | `getClaimable` | View function | Returns correct amount |

### 34.9 Compliance Modules

| # | Module | Test Case | Expected Result |
|---|--------|-----------|-----------------|
| 34.9.1 | CountryAllowModule | Transfer from allowed country | Succeeds |
| 34.9.2 | CountryAllowModule | Transfer from blocked country | Reverts |
| 34.9.3 | MaxHolderCountModule | Transfer creating new holder within limit | Succeeds |
| 34.9.4 | MaxHolderCountModule | Transfer that would exceed max holders | Reverts |

---

## 35. State Machine Tests

### 35.1 Sale Status Transitions

```
draft → active → paused → active → finalized (success)
                                  → finalized_failed → refunds_enabled
```

| # | From | To | Trigger | Validation |
|---|------|----|---------|------------|
| 35.1.1 | `draft` | `active` | Admin activates sale | Sale start time reached, phases configured |
| 35.1.2 | `active` | `paused` | Admin pauses | All contributions rejected while paused |
| 35.1.3 | `paused` | `active` | Admin resumes | Contributions resume |
| 35.1.4 | `active` | `finalized` | End time + above soft cap + finalize() | Tokens distributable, issuer can withdraw |
| 35.1.5 | `active` | `finalized_failed` | End time + below soft cap + finalize() | Refunds enabled |
| 35.1.6 | — | `draft` | Invalid transition from active | Rejected |
| 35.1.7 | `finalized` | anything | No further transitions | Rejected |

### 35.2 KYC Status Transitions

```
none → pending → approved (→ expired → pending → approved)
              → rejected (→ pending → approved)
```

(Detailed in section 4.2)

### 35.3 Redemption Status Transitions

```
pending → processing → shipped → fulfilled
                              → cancelled
```

| # | From | To | Trigger |
|---|------|----|---------|
| 35.3.1 | `pending` | `processing` | Issuer marks processing |
| 35.3.2 | `processing` | `shipped` | Issuer marks shipped (sets `shipped_at`) |
| 35.3.3 | `shipped` | `fulfilled` | Issuer marks fulfilled (sets `fulfilled_at`) |
| 35.3.4 | `pending` | `cancelled` | Issuer cancels |
| 35.3.5 | `cancelled` | anything | No further transitions |
| 35.3.6 | `fulfilled` | anything | No further transitions |

### 35.4 Token Lifecycle

```
created (DB only) → deployed (on-chain) → active → paused → active
```

### 35.5 Issuer Status Transitions

```
pending → active → suspended → active
```

---

## 36. On-Chain vs Off-Chain Consistency

| # | Check | Method | Expected |
|---|-------|--------|----------|
| 36.1 | Token balance on-chain matches DB | Compare `CiretaToken.balanceOf(addr)` vs `portfolio.holdings[].balance` | Equal |
| 36.2 | Sale total raised | Compare `Sale.totalRaised()` vs `token_sales.total_raised` in DB | Equal |
| 36.3 | Token paused state | Compare `CiretaToken.paused()` vs `tokens.is_paused` in DB | Equal |
| 36.4 | Contribution amounts | Compare on-chain events vs `contributions` table | Match for all entries |
| 36.5 | Token contract address | `tokenFactory` events vs `tokens.contract_address` in DB | Match |
| 36.6 | Sale contract address | `saleFactory` events vs `token_sales.contract_address` in DB | Match |
| 36.7 | Frozen addresses | On-chain frozen state vs compliance audit logs | Consistent |
| 36.8 | KYC identity registry | On-chain identity vs `users.kyc_status` | Consistent |
| 36.9 | Dividend epochs | `DividendDistributor.currentEpoch()` vs `dividend_distributions` count | Match |
| 36.10 | Platform fee receiver | `PlatformFeeManager.feeReceiver()` vs `PLATFORM_FEE_RECEIVER` env | Match |
| 36.11 | Issuer registration | `IssuerRegistry.isRegistered(addr)` vs `issuers.status` | Consistent |

---

## 37. Webhook & Event Listener Tests

### 37.1 Webhook Processing

| # | Test Case | Expected Result | Backend Check |
|---|-----------|-----------------|---------------|
| 37.1.1 | Sumsub webhook received | Stored in `webhook_events` with `provider='sumsub'`, `status='pending'` | DB row created |
| 37.1.2 | Webhook processed | Status changes to `processed`, `processed_at` set | — |
| 37.1.3 | Webhook processing fails | `attempts` incremented, `last_error` set | Retry scheduled |
| 37.1.4 | Max retries exceeded (3) | Status changes to `failed` (dead letter) | `status='failed'`, `attempts=3` |
| 37.1.5 | Replay webhook | `POST /api/v1/admin/webhooks/{id}/replay` | `status='pending'`, `attempts=0`, `last_error=null` | Re-queued |
| 37.1.6 | Replay already processed | Replay on `status='processed'` webhook | "Webhook already processed" message, no re-processing |
| 37.1.7 | Replay not found | Invalid webhook ID | 404: "Webhook event not found" |
| 37.1.8 | List webhooks | `GET /api/v1/admin/webhooks` | Returns webhooks ordered by `created_at` desc, max 100 |
| 37.1.9 | Filter webhooks by status | `GET /api/v1/admin/webhooks?status_filter=failed` | Only failed webhooks returned |

### 37.2 Event Listener Service

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37.2.1 | ContributionReceived event | Listener processes → updates DB contribution + total_raised |
| 37.2.2 | TokensPurchased event | Listener creates/updates contribution record |
| 37.2.3 | SaleFinalized event | Listener updates sale status, triggers notification emails |
| 37.2.4 | TokenDeployed event | Listener stores contract address |
| 37.2.5 | TransferEvent | Listener updates balances if relevant |
| 37.2.6 | Block reorg | Events re-processed correctly |
| 37.2.7 | RPC connection lost | Reconnection logic, no events missed after reconnect |

---

## 38. Worker / Background Task Tests

| # | Test Case | Expected Result | Check |
|---|-----------|-----------------|-------|
| 38.1 | Worker heartbeat | Redis key `cireta:worker:heartbeat` updated periodically | `redis-cli GET cireta:worker:heartbeat` → recent timestamp |
| 38.2 | Worker processes queued jobs | Webhook processing, email sending | Jobs consumed from Redis queue |
| 38.3 | Worker crash recovery | Worker restarts after crash | `docker compose restart worker` → jobs resume |
| 38.4 | KYC expiry check | Periodic job checks expired KYC | Users past expiry → status updated |
| 38.5 | Event listener runs | Continuously polls for new blocks | New on-chain events reflected in DB |

---

## 39. Email Service Tests

### 39.1 Email Triggers

| # | Trigger | Template | Recipient |
|---|---------|----------|-----------|
| 39.1.1 | Registration | Email verification link (`/verify-email?token=xxx`) | New user |
| 39.1.2 | Forgot password | Password reset link (`/reset-password?token=xxx`) | Requesting user |
| 39.1.3 | KYC approved | "You are verified!" with level, "Browse Projects" link | Verified user |
| 39.1.4 | KYC rejected | "Verification Not Approved" with reason, "Try Again" link | Rejected user |
| 39.1.5 | Investment confirmed | Amount, token symbol, tx link, "View Portfolio" link | Investor |
| 39.1.6 | Sale finalized (success) | Token symbol, "Claim Tokens" link | All investors |
| 39.1.7 | Sale finalized (failed) | "Did Not Meet Soft Cap", "Claim Refund" link | All investors |
| 39.1.8 | KYC expiry warning | Days left, "Re-verify Now" link | Expiring users |
| 39.1.9 | Redemption fulfilled | Token symbol, "View Portfolio" link | Redeemer |

### 39.2 Email Service Behavior

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39.2.1 | Development mode, no API key | Warning logged, email skipped, returns False |
| 39.2.2 | Production, no API key | RuntimeError raised |
| 39.2.3 | Production, API key set | Resend API called, email sent |
| 39.2.4 | Resend API failure | Error logged, raises in production, returns False in dev |
| 39.2.5 | All emails from address | "Cireta <noreply@cireta.com>" | — |

---

## 40. API-Level Security & Validation

### 40.1 Authentication & Authorization

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 40.1.1 | Access protected endpoint without token | 401 Unauthorized |
| 40.1.2 | Access with expired JWT | 401 |
| 40.1.3 | Access with malformed JWT | 401 |
| 40.1.4 | Investor accesses admin endpoint | 403 Forbidden |
| 40.1.5 | Issuer accesses platform-admin endpoint | 403 Forbidden |
| 40.1.6 | Token refresh with valid refresh token | New access token issued |
| 40.1.7 | Token refresh with expired refresh token | 401 |
| 40.1.8 | Token refresh with revoked token | 401 |
| 40.1.9 | Access other user's data | 403 or filtered (no data leak) |

### 40.2 Input Validation (Server-Side)

| # | Endpoint | Validation | Test Input | Expected |
|---|----------|-----------|------------|----------|
| 40.2.1 | POST /auth/register | Email format | `not-email` | 422 |
| 40.2.2 | POST /auth/register | Password complexity regex | `weak` | 422 with message |
| 40.2.3 | POST /auth/register | Password max length | 129 chars | 422 |
| 40.2.4 | POST /auth/reset-password | Password complexity | `12345678` | 422 |
| 40.2.5 | PATCH /admin/issuers/{id}/fee | Fee BPS range | `fee_bps: -1` | 422 (ge=0) |
| 40.2.6 | PATCH /admin/issuers/{id}/fee | Fee BPS range | `fee_bps: 10001` | 422 (le=10000) |
| 40.2.7 | POST /admin/issuers | Slug format | `Invalid Slug!` | 422 (pattern: `^[a-z0-9-]+$`) |
| 40.2.8 | POST /admin/issuers | Name length | Empty string | 422 (min_length=1) |
| 40.2.9 | POST /admin/issuers | Name length | 256 chars | 422 (max_length=255) |
| 40.2.10 | POST /auth/mfa/enable | Code length | 5-digit | 422 (min_length=6) |
| 40.2.11 | POST /auth/mfa/verify | Code length | 9-digit | 422 (max_length=8) |
| 40.2.12 | PATCH /auth/me | Display name length | 101 chars | 422 (max_length=100) |
| 40.2.13 | POST /wallets/link | Invalid address | `0xNOTHEX` | 422 |
| 40.2.14 | POST /wallets/link | Invalid signature | Random bytes | 400 |
| 40.2.15 | POST /sales/{id}/contribute | Negative amount | `-100` | 400 |
| 40.2.16 | POST /sales/{id}/contribute | Zero amount | `0` | 400 |
| 40.2.17 | UUID parameters | Invalid UUID | `not-a-uuid` | 422 |

### 40.3 Rate Limiting

| # | Endpoint | Expected Limit |
|---|----------|---------------|
| 40.3.1 | POST /auth/login | Rate limited after N failed attempts |
| 40.3.2 | POST /auth/register | Rate limited per IP |
| 40.3.3 | POST /auth/forgot-password | Rate limited (prevent email bombing) |
| 40.3.4 | POST /kyc/token | Rate limited per user |

---

## 41. CORS, CSP & Security Headers

| # | Header / Policy | Test | Expected |
|---|----------------|------|----------|
| 41.1 | CORS origins | Request from `http://evil.com` | Rejected (not in CORS_ORIGINS) |
| 41.2 | CORS origins | Request from `http://localhost:3000` | Allowed |
| 41.3 | CORS origins | Request from `https://launchpad.cireta.com` | Allowed |
| 41.4 | CORS origins | Request from `https://admin.cireta.com` | Allowed |
| 41.5 | CORS preflight | OPTIONS request | Returns allowed methods, headers |
| 41.6 | Strict-Transport-Security | Production HTTPS | HSTS header present |
| 41.7 | X-Content-Type-Options | Any response | `nosniff` |
| 41.8 | X-Frame-Options | Any response | `DENY` or `SAMEORIGIN` |
| 41.9 | Content-Security-Policy | Any HTML response | Appropriate CSP directives |
| 41.10 | httpOnly cookie | Login response | Refresh token cookie has `httpOnly=true`, `Secure=true` (prod), `SameSite=Lax` |
| 41.11 | No JWT in response body | Login via admin Next.js route handler | JWT stored server-side only, not exposed to client JS |
| 41.12 | API key not exposed | Frontend code | No `SUMSUB_SECRET_KEY`, `DEPLOYER_PRIVATE_KEY`, `ENCRYPTION_KEY` in client bundle |

---

## 42. Race Conditions & Concurrency

| # | Scenario | Test Method | Expected Result |
|---|----------|------------|-----------------|
| 42.1 | Double contribute | Same user submits 2 tx in same block | One succeeds, other may hit "exceeds block limit" or "exceeds max" |
| 42.2 | Concurrent KYC webhooks | Two webhooks for same user simultaneously | Only one update applied, no DB corruption |
| 42.3 | Simultaneous wallet link | Link same wallet from 2 tabs | One succeeds, other gets "already linked" |
| 42.4 | Claim tokens twice | Rapidly click claim button twice | Button disabled after first click, only one on-chain tx |
| 42.5 | Double submit registration | Click register twice rapidly | Only one user created (button disabled after first click) |
| 42.6 | Concurrent sale finalization | Two admins finalize simultaneously | Only one finalization succeeds |
| 42.7 | Contribution during finalization | User contributes while admin finalizes | One operation wins based on block ordering |
| 42.8 | Hard cap race | Multiple users contribute up to hard cap simultaneously | Total does not exceed hard cap (on-chain enforcement) |
| 42.9 | Double claim dividend | Claim dividend from two devices | On-chain idempotent — second claim gets zero |
| 42.10 | Freeze during transfer | Admin freezes while user transfers | Transfer reverts or freeze applied after |
| 42.11 | Double OTC allocation | Submit same OTC allocation twice rapidly | Duplicate check or idempotent |
| 42.12 | Withdraw during withdrawal | Two withdrawal requests concurrently | Only available balance withdrawn |
| 42.13 | Token pause during contribute | Pause token while contribution in flight | Contribution reverts (compliance check fails) |

---

## 43. Responsive & Cross-Browser

### 43.1 Breakpoints

| # | Breakpoint | Pages to Test | Key Checks |
|---|-----------|---------------|------------|
| 43.1.1 | Mobile (< 640px) | All pages | Navigation collapses, cards stack vertically, tables scroll horizontally |
| 43.1.2 | Tablet (640-1024px) | All pages | 2-column grids, sidebar may collapse |
| 43.1.3 | Desktop (> 1024px) | All pages | Full layout as designed |
| 43.1.4 | Explore page mobile | Filters | Asset type pills scroll horizontally, status filters hidden |
| 43.1.5 | Project detail mobile | Layout | Hero image + info stacks, tabs scroll, invest sidebar moves below |
| 43.1.6 | Portfolio mobile | Stats grid | `grid-cols-2` on small, `grid-cols-4` on lg |
| 43.1.7 | Admin tables mobile | DataTable | Horizontal scroll |

### 43.2 Browser Compatibility

| Browser | Version | Test |
|---------|---------|------|
| Chrome | Latest | Full test suite |
| Firefox | Latest | Full test suite |
| Safari | Latest | Full test suite (especially wallet connections) |
| Edge | Latest | Spot checks |
| Mobile Safari | iOS Latest | Key flows |
| Mobile Chrome | Android Latest | Key flows |

---

## 44. Accessibility

| # | Check | Pages | Expected |
|---|-------|-------|----------|
| 44.1 | Keyboard navigation | All forms | Tab order logical, all interactive elements focusable |
| 44.2 | Screen reader labels | All inputs | `<label>` elements with `htmlFor` matching input `id` |
| 44.3 | ARIA attributes | Toggle switches | `role="switch"`, `aria-checked`, `aria-label` present |
| 44.4 | Color contrast | All text | WCAG AA contrast ratios met |
| 44.5 | Focus indicators | All interactive | Visible focus ring on keyboard navigation |
| 44.6 | Alt text | Images | All `<Image>` have descriptive `alt` attributes |
| 44.7 | Error announcements | Form errors | Error messages associated with inputs (aria-describedby) |
| 44.8 | Loading state | Spinners | `aria-live="polite"` or equivalent for dynamic content |
| 44.9 | Link purpose | All links | Descriptive text (not just "click here") |
| 44.10 | Heading hierarchy | All pages | Logical h1 → h2 → h3 nesting |

---

## Appendix A: API Endpoint Reference

| Method | Endpoint | Auth Required | Role | Purpose |
|--------|----------|---------------|------|---------|
| POST | `/api/v1/auth/register` | No | — | Register user |
| POST | `/api/v1/auth/login` | No | — | Login |
| POST | `/api/v1/auth/refresh` | Cookie | — | Refresh JWT |
| POST | `/api/v1/auth/forgot-password` | No | — | Request password reset |
| POST | `/api/v1/auth/reset-password` | No | — | Reset password with token |
| GET | `/api/v1/auth/me` | Yes | Any | Get current user |
| PATCH | `/api/v1/auth/me` | Yes | Any | Update profile |
| POST | `/api/v1/auth/mfa/setup` | Yes | Any | Start MFA setup |
| POST | `/api/v1/auth/mfa/enable` | Yes | Any | Enable MFA |
| POST | `/api/v1/auth/mfa/verify` | Partial | Any | Verify MFA code |
| POST | `/api/v1/auth/mfa/disable` | Yes | Any | Disable MFA |
| POST | `/api/v1/kyc/token` | Yes | Any | Get Sumsub access token |
| GET | `/api/v1/kyc/status` | Yes | Any | Get KYC status |
| POST | `/api/v1/kyc/corporate` | Yes | Any | Initiate corporate KYB |
| GET | `/api/v1/kyc/corporate/status` | Yes | Any | Get KYB status |
| POST | `/api/v1/kyc/webhook` | Webhook | — | Sumsub webhook |
| GET | `/api/v1/wallets` | Yes | Any | List wallets |
| POST | `/api/v1/wallets/link` | Yes | Any | Link wallet |
| DELETE | `/api/v1/wallets/{address}` | Yes | Any | Unlink wallet |
| PATCH | `/api/v1/wallets/{address}/primary` | Yes | Any | Set primary wallet |
| GET | `/api/v1/sales` | No | — | List sales |
| GET | `/api/v1/sales/{id}` | No | — | Get sale detail |
| GET | `/api/v1/sales/by-slug/{slug}` | No | — | Get sale by slug |
| POST | `/api/v1/sales/{id}/contribute` | Yes | Investor | Record contribution |
| POST | `/api/v1/sales/{id}/otc` | Yes | Issuer/Admin | Record OTC allocation |
| GET | `/api/v1/tokens` | No | — | List tokens |
| GET | `/api/v1/tokens/{id}` | No | — | Get token detail |
| POST | `/api/v1/tokens` | Yes | Issuer/Admin | Create token |
| POST | `/api/v1/tokens/{id}/deploy` | Yes | Issuer/Admin | Deploy token on-chain |
| GET | `/api/v1/portfolio` | Yes | Investor | Get portfolio summary |
| GET | `/api/v1/portfolio/vesting` | Yes | Investor | Get vesting schedules |
| POST | `/api/v1/portfolio/vesting/{id}/claim` | Yes | Investor | Record vesting claim |
| POST | `/api/v1/portfolio/redemptions` | Yes | Investor | Create redemption request |
| GET | `/api/v1/portfolio/dividends` | Yes | Investor | Get dividend entries |
| GET | `/api/v1/portfolio/transactions` | Yes | Investor | Get transactions |
| GET | `/api/v1/notifications` | Yes | Any | List notifications |
| PATCH | `/api/v1/notifications/{id}/read` | Yes | Any | Mark notification read |
| GET | `/api/v1/notifications/preferences` | Yes | Any | Get notification preferences |
| PATCH | `/api/v1/notifications/preferences` | Yes | Any | Update preferences |
| POST | `/api/v1/admin/compliance/freeze` | Yes | Issuer/Admin | Freeze address |
| POST | `/api/v1/admin/compliance/unfreeze` | Yes | Issuer/Admin | Unfreeze address |
| POST | `/api/v1/admin/compliance/forced-transfer` | Yes | Issuer/Admin | Forced transfer |
| POST | `/api/v1/admin/compliance/recover` | Yes | Issuer/Admin | Recover tokens |
| POST | `/api/v1/admin/compliance/pause-token` | Yes | Issuer/Admin | Pause token |
| POST | `/api/v1/admin/compliance/unpause-token` | Yes | Issuer/Admin | Unpause token |
| GET | `/api/v1/admin/compliance/audit-logs` | Yes | Issuer/Admin | List audit logs |
| GET | `/api/v1/admin/compliance/frozen` | Yes | Issuer/Admin | List frozen addresses |
| PATCH | `/api/v1/admin/redemptions/{id}` | Yes | Issuer/Admin | Update redemption status |
| GET | `/api/v1/admin/redemptions` | Yes | Issuer/Admin | List redemptions |
| POST | `/api/v1/admin/dividends/deposit` | Yes | Issuer/Admin | Record dividend deposit |
| POST | `/api/v1/admin/dividends/{token_id}/deposit` | Yes | Issuer/Admin | Record dividend (path variant) |
| GET | `/api/v1/admin/dividends` | Yes | Issuer/Admin | List distributions |
| POST | `/api/v1/admin/webhooks/{id}/replay` | Yes | Issuer/Admin | Replay webhook |
| GET | `/api/v1/admin/webhooks` | Yes | Issuer/Admin | List webhooks |
| GET | `/api/v1/admin/investors` | Yes | Issuer/Admin | List investors |
| GET | `/api/v1/admin/issuers` | Yes | Admin | List issuers |
| POST | `/api/v1/admin/issuers` | Yes | Admin | Create issuer |
| POST | `/api/v1/admin/issuers/{id}/activate` | Yes | Admin | Activate issuer |
| POST | `/api/v1/admin/issuers/{id}/revoke` | Yes | Admin | Revoke issuer |
| PATCH | `/api/v1/admin/issuers/{id}/fee` | Yes | Admin | Update issuer fee |
| GET | `/api/v1/admin/platform/stats` | Yes | Admin | Platform analytics |
| GET | `/api/v1/admin/platform/settings` | Yes | Admin | Get platform settings |
| PATCH | `/api/v1/admin/platform/settings` | Yes | Admin | Update platform settings |
| GET | `/api/v1/admin/platform/users` | Yes | Admin | List all users |
| GET | `/api/v1/admin/issuer/reports/{type}` | Yes | Issuer/Admin | Download CSV report |
| POST | `/api/v1/admin/issuer/withdraw` | Yes | Issuer | Execute withdrawal |
| GET | `/api/v1/admin/issuer/withdrawals` | Yes | Issuer | List withdrawals |
| GET | `/api/v1/health/live` | No | — | Liveness probe |
| GET | `/api/v1/health/ready` | No | — | Readiness probe (DB + Redis) |

---

## Appendix B: Database Models Reference

| Table | Key Fields | Constraints |
|-------|-----------|-------------|
| `users` | id (UUID), email (unique), password_hash, role (investor/issuer/admin), kyc_status (none/pending/approved/rejected/expired), kyc_level (0-4), mfa_enabled, mfa_secret, display_name, country_code, investor_type, email_verified, onchain_id | email unique, password_hash bcrypt |
| `wallets` | id, user_id (FK→users), address (unique), is_primary, is_safe, screening_status, linked_at | address unique |
| `issuers` | id, user_id (FK→users), name, slug (unique), legal_entity_name, jurisdiction, wallet_address, fee_bps, status | slug unique |
| `tokens` | id, issuer_id (FK→issuers), name, symbol, slug, asset_type, total_supply, decimals, description, contract_address, is_paused | — |
| `token_sales` | id, token_id (FK→tokens), issuer_id (FK→issuers), status, soft_cap, hard_cap, total_raised, contract_address, start_time, end_time | — |
| `sale_phases` | id, sale_id (FK→token_sales), phase_number, name, price_per_token, allocation, min_contribution, max_contribution, start_time, end_time, is_active | — |
| `contributions` | id, user_id, sale_id, phase_id, wallet_address, amount, tokens_allocated, tx_hash, is_otc, otc_reference | — |
| `vesting_schedules` | id, user_id, token_id, sale_id, total_amount, claimed_amount, claimable_amount, cliff_end, vesting_end, last_claim_at, sale_mode, vault_address, sale_contract_address | — |
| `redemption_requests` | id, user_id, token_id, amount, status, fulfillment_method, delivery_name, delivery_address, delivery_phone, tx_hash, shipped_at, fulfilled_at, notes | — |
| `dividend_distributions` | id, token_id, epoch_index, total_amount, contract_address, tx_hash | — |
| `dividend_claims` | id, user_id, distribution_id, amount, tx_hash, claimed_at | — |
| `audit_logs` | id, actor_id, action, target_type, target_id, reason, ip_address, payload (JSON) | — |
| `webhook_events` | id, provider, payload (JSON), status (pending/processed/failed), attempts, last_error, processed_at | — |
| `notifications` | id, user_id (FK→users), type, title, message, data (JSON), read, emailed | — |
| `platform_settings` | key, value | — |
| `frozen_addresses` | (derived from audit_logs via freeze/unfreeze actions) | — |

---

## Appendix C: Smart Contract Deployment (Base Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| IdentityRegistryStorage | `0xFEe7c667db9b54767A8772dcBC81a9d177C0954E` | Stores identity claims |
| ClaimTopicsRegistry | `0xc2A8F6ef64B375872dBf09BD3Eb650a620687F02` | Defines required claim topics |
| TrustedIssuersRegistry | `0xA695Dd3a5bc6c34BC914a650fAa46596e2E03319` | Trusted claim issuers |
| IssuerRegistry | `0x3bdE32b8AC48d8015e34E2335B5a640072105225` | Platform issuer registry |
| PlatformFeeManager | `0x545Ce9dc34E3086B505D9fd8DB443906E2c796f6` | Fee collection |
| Token Implementation | `0x35e6CD52b56642A7f1f172e29e6fEa3b9d9473Bc` | ERC-3643 token template |
| Identity Registry Impl | `0x921905f38a3af1C35638f2fAA97B41EA4d7f300c` | Identity registry template |
| Compliance Implementation | `0xcD84cad8615664472cbFCCa3dAFFC3270c423039` | Modular compliance template |
| Sale Implementation | `0x4dA3aeEbd5A1390A450811445fC3d57beF0a2031` | Sale contract template |
| TokenFactory | `0x6918cE85Da96C07Deaeba796512422ab8AEEB99D` | Deploys new tokens |
| SaleFactory | `0xe4a06Eaa949D12B173B0bA5f7CaABe473b4e8b5F` | Deploys new sales |
| CountryAllowModule | `0xce620bd7213ed4b56D5AEFc445C3da95C4C7bd24` | Country-based transfer restriction |
| MaxHolderCountModule | `0xC21EA2D0f85b25D29e2f9e971d5F76a54986c585` | Maximum holder count restriction |

---

## Appendix D: Environment Variables (from .env.example)

| Variable | Required | Purpose | Security Note |
|----------|----------|---------|---------------|
| `DATABASE_URL` | Yes | PostgreSQL connection (asyncpg) | Never expose |
| `REDIS_URL` | Yes | Redis connection | Never expose |
| `JWT_SECRET_KEY` | Yes (prod) | JWT signing key | Never expose, rotate regularly |
| `ENCRYPTION_KEY` | Yes (prod) | Data encryption key | Never expose |
| `CHAIN_ID` | Yes | Blockchain network (8453=Base) | — |
| `WEB3_RPC_URL` | Yes | RPC endpoint | — |
| `DEPLOYER_PRIVATE_KEY` | Yes | Contract deployer key | CRITICAL — never expose |
| `PLATFORM_FEE_RECEIVER` | Yes | Fee collection address | — |
| `SUMSUB_APP_TOKEN` | Yes | KYC provider token | Never expose |
| `SUMSUB_SECRET_KEY` | Yes | KYC webhook verification | Never expose |
| `RESEND_API_KEY` | Yes (prod) | Email service key | Never expose |
| `SCREENING_API_KEY` | Optional | Wallet screening (Chainalysis/Elliptic) | Never expose |
| `PINATA_API_KEY` | Optional | IPFS pinning | Never expose |
| `CORS_ORIGINS` | Yes | Allowed origins | Must be explicit in prod |

---

_End of test plan. Total test cases: ~450+. Every page, every form, every button, every API endpoint, every smart contract function, every state transition, every error path._