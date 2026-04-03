# Playwright E2E Test Plan

**Date:** 2026-04-03 09:30 UTC+4  
**Status:** Plan

---

## Infrastructure

**Apps:**
- Launchpad: `localhost:4010` (investor portal)
- Admin/Issuer: `localhost:5010` (admin + issuer portal)
- API: `localhost:3010` (backend)

**Test accounts:**
- Admin: `admin@cireta.com` (OTP login)
- Issuer: `issuer@cireta.com` (OTP login)
- Investor 01: new registration via OTP
- Investor 02: new registration via OTP

**Wallet strategy:**
Mock wallet provider — inject a test signer that auto-approves transactions (no MetaMask popup). On-chain operations hit Base Sepolia, signing happens programmatically via injected private keys.

---

## Test Suites (8 suites, ~45 test cases)

### Suite 1: Authentication & Registration

| # | Test Case | App |
|---|-----------|-----|
| 1.1 | Investor registers with email (OTP flow) | Launchpad |
| 1.2 | Investor receives dev OTP and verifies | Launchpad |
| 1.3 | Welcome modal appears with onboarding steps | Launchpad |
| 1.4 | Investor logs out and logs back in | Launchpad |
| 1.5 | Admin logs in via Platform Admin path | Admin |
| 1.6 | Issuer logs in via Issuer path | Admin |
| 1.7 | Invalid OTP shows error | Launchpad |
| 1.8 | Expired OTP shows error | Launchpad |

### Suite 2: Investor Onboarding

| # | Test Case | App |
|---|-----------|-----|
| 2.1 | Choose investor type (individual) | Launchpad |
| 2.2 | Fill basic information (name, DOB, nationality) | Launchpad |
| 2.3 | KYC page loads (Sumsub or skip in dev) | Launchpad |
| 2.4 | Connect wallet (link wallet flow) | Launchpad |
| 2.5 | Onboarding progress updates (0/4 → 4/4) | Launchpad |

### Suite 3: Admin — KYC & User Management

| # | Test Case | App |
|---|-----------|-----|
| 3.1 | Admin navigates to Users page | Admin |
| 3.2 | Search and find investor | Admin |
| 3.3 | View investor detail page | Admin |
| 3.4 | Manually approve KYC | Admin |
| 3.5 | Check Sumsub status (sync check) | Admin |
| 3.6 | Confirm sync updates DB + notification | Admin |
| 3.7 | KYC status reflects on investor profile | Admin |

### Suite 4: Admin — Issuer Management

| # | Test Case | App |
|---|-----------|-----|
| 4.1 | Admin navigates to Issuers page | Admin |
| 4.2 | View issuer list with status filters | Admin |
| 4.3 | Approve issuer (activate) | Admin |
| 4.4 | Register issuer on-chain (wallet signing) | Admin |
| 4.5 | Verify on-chain status badge updates | Admin |
| 4.6 | Update issuer fee | Admin |
| 4.7 | Revoke/suspend issuer | Admin |

### Suite 5: Issuer — Token & Sale Creation

| # | Test Case | App |
|---|-----------|-----|
| 5.1 | Issuer creates new token (DB) | Admin |
| 5.2 | Issuer deploys token on-chain (wallet) | Admin |
| 5.3 | Token detail shows contract address | Admin |
| 5.4 | Issuer navigates to mint page | Admin |
| 5.5 | Issuer mints project tokens (wallet) | Admin |
| 5.6 | Issuer creates new sale (wizard) | Admin |
| 5.7 | Issuer selects cUSDC as payment token | Admin |
| 5.8 | Sale appears in issuer's sale list | Admin |
| 5.9 | Issuer deploys sale on-chain (guided wizard) | Admin |
| 5.10 | Issuer adds phase post-deployment (wallet) | Admin |
| 5.11 | Sale detail shows contract address + phases | Admin |

### Suite 6: Admin — Sale Approval & Activation

| # | Test Case | App |
|---|-----------|-----|
| 6.1 | Admin navigates to Sales page | Admin |
| 6.2 | Admin sees pending sale | Admin |
| 6.3 | Admin approves sale (DB — launchpad visibility) | Admin |
| 6.4 | Admin activates sale on-chain (wallet) | Admin |
| 6.5 | Sale status changes to Active | Admin |
| 6.6 | Sale appears on launchpad | Launchpad |
| 6.7 | Admin can pause active sale (wallet) | Admin |
| 6.8 | Admin can unpause paused sale (wallet) | Admin |

### Suite 7: Investor — Buy & Claim Flow

| # | Test Case | App |
|---|-----------|-----|
| 7.1 | Investor browses projects on launchpad | Launchpad |
| 7.2 | Sale card shows phase badge + progress | Launchpad |
| 7.3 | Investor clicks into project detail | Launchpad |
| 7.4 | Phase timeline shows active phase with countdown | Launchpad |
| 7.5 | Investor clicks Buy / Invest | Launchpad |
| 7.6 | Investor selects USDC, enters amount | Launchpad |
| 7.7 | Investor approves USDC (wallet) | Launchpad |
| 7.8 | Investor confirms buy (wallet) | Launchpad |
| 7.9 | Contribution recorded in portfolio | Launchpad |
| 7.10 | Admin finalizes sale (wallet) | Admin |
| 7.11 | Investor claims tokens (wallet) | Launchpad |
| 7.12 | Token balance updates in portfolio | Launchpad |

### Suite 8: Advanced Flows

| # | Test Case | App |
|---|-----------|-----|
| 8.1 | OTC: Issuer mints OTC tokens to investor (wallet) | Admin |
| 8.2 | OTC: Investor sees OTC payment option on invest page | Launchpad |
| 8.3 | OTC: Investor buys with OTC token (approve + buyOTC) | Launchpad |
| 8.4 | Vested: Investor buys vested sale → fractions minted | Launchpad |
| 8.5 | Vested: After vesting, investor claims → fractions burned | Launchpad |
| 8.6 | Transfer: Investor transfers tokens to another wallet | Launchpad |
| 8.7 | Issuer withdraws USDC proceeds after finalization | Admin |
| 8.8 | Issuer withdraws project tokens from draft sale | Admin |
| 8.9 | Email management: Admin edits template, sends preview | Admin |
| 8.10 | Fee dashboard: Admin views fee analytics | Admin |

---

## Test File Structure

```
tests/
├── playwright.config.ts
├── helpers/
│   ├── auth.ts          — OTP login helper (request + verify)
│   ├── wallet.ts        — Inject test wallet provider
│   └── fixtures.ts      — Test data (addresses, amounts)
├── e2e/
│   ├── 01-auth.spec.ts
│   ├── 02-onboarding.spec.ts
│   ├── 03-admin-kyc.spec.ts
│   ├── 04-admin-issuers.spec.ts
│   ├── 05-issuer-token-sale.spec.ts
│   ├── 06-admin-sale-approval.spec.ts
│   ├── 07-investor-buy-claim.spec.ts
│   └── 08-advanced-flows.spec.ts
```

## Prerequisites

1. API running at `localhost:3010`
2. Admin app running at `localhost:5010`
3. Launchpad running at `localhost:4010`
4. Base Sepolia contracts deployed
5. Test wallets funded with ETH + cUSDC
6. `IDENTITY_MODE=simple` in `.env`
