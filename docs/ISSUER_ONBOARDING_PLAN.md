# Issuer Onboarding Plan

**Date:** 2026-03-29
**Status:** Implemented (Phase 1 + Phase 2)

---

## Lifecycle

```
Admin whitelists email + sets issuer type (individual/corporate)
        ↓
Issuer registers (role=ISSUER, status=PENDING)
        ↓
Issuer dashboard — two independent tasks (any order):
   ├── Connect wallet → admin approves wallet
   └── Complete KYC or KYB (based on issuer type) → auto-verified by Sumsub
        ↓
Admin reviews & activates issuer (all gates must be green)
        ↓
Issuer can deploy tokens & sales
```

## Gates (all must be green before deploying)

| Gate | Set by | Required for |
|---|---|---|
| Email whitelisted | Admin | Registration |
| Issuer type (individual/corporate) | Admin (at whitelist) | Determines KYC vs KYB |
| Wallet connected | Issuer | Activation |
| Wallet approved | Admin | Activation |
| KYC/KYB completed | Sumsub | Activation |
| Issuer activated | Admin | Deploy tokens/sales |

---

## Phase 1: Backend

### 1a. IssuerWhitelist model

New table `issuer_whitelist`:
- `id` (UUID, PK)
- `email` (str, unique, indexed)
- `issuer_type` (enum: individual/corporate)
- `invited_by` (UUID FK → users)
- `created_at` (datetime)
- `registered_at` (datetime, nullable — set when issuer registers)

Admin endpoints:
- `POST /api/v1/admin/issuers/whitelist` — add email + issuer type
- `GET /api/v1/admin/issuers/whitelist` — list all (filterable by status)
- `DELETE /api/v1/admin/issuers/whitelist/{id}` — remove

Registration change:
- `POST /api/v1/auth/register` — check if email is in whitelist
  - If yes: set `role=ISSUER`, create Issuer record with `status=PENDING` and `issuer_type` from whitelist, mark whitelist entry as registered
  - If no: register as normal INVESTOR (unchanged behavior)

### 1b. Issuer model additions

New/modified fields on `Issuer`:
- `issuer_type`: `individual` / `corporate` (set from whitelist at registration)
- `wallet_status`: `NONE` / `PENDING_APPROVAL` / `APPROVED` / `REJECTED` (default: NONE)
- `identity_status`: `NONE` / `PENDING` / `APPROVED` / `REJECTED` (default: NONE)
- `identity_verified_at` (datetime, nullable)
- `sumsub_applicant_id` (EncryptedString, nullable)

Bug fix:
- When admin activates issuer: also set `User.role = ISSUER`
- When admin revokes issuer: also set `User.role = INVESTOR`

### 1c. Issuer endpoints (new)

- `POST /api/v1/issuer/wallet` — issuer submits connected wallet address
  - Sets `issuer.wallet_address` and `issuer.wallet_status = PENDING_APPROVAL`
  - Requires authenticated issuer

- `POST /api/v1/issuer/identity/initiate` — starts KYC or KYB based on `issuer_type`
  - If `issuer_type == individual`: Sumsub `basic-kyc-level`
  - If `issuer_type == corporate`: Sumsub `business-kyb-level`
  - Returns WebSDK access token
  - Sets `issuer.identity_status = PENDING`

- `GET /api/v1/issuer/identity/status` — returns current verification status

- `GET /api/v1/issuer/onboarding-status` — returns all gates in one response:
  ```json
  {
    "issuer_status": "pending",
    "issuer_type": "corporate",
    "wallet_connected": true,
    "wallet_status": "approved",
    "identity_status": "approved",
    "can_deploy": false,
    "missing_gates": ["issuer_activation"]
  }
  ```

### 1d. Admin endpoints (new/modified)

- `POST /api/v1/admin/issuers/{id}/approve-wallet` — sets `wallet_status = APPROVED`
- `POST /api/v1/admin/issuers/{id}/reject-wallet` — sets `wallet_status = REJECTED`
- `POST /api/v1/admin/issuers/{id}/activate` — modified:
  - Returns 400 if `wallet_status != APPROVED`
  - Returns 400 if `identity_status != APPROVED`
  - Sets `issuer.status = ACTIVE` and `user.role = ISSUER`

### 1e. Deploy gate

Token and sale deploy endpoints check:
- `issuer.status == ACTIVE` (which implies all sub-gates passed)
- Return clear error: `ISSUER_NOT_ACTIVE`, `WALLET_NOT_APPROVED`, `IDENTITY_NOT_VERIFIED`

### 1f. Alembic migration

Single migration for:
- `issuer_whitelist` table
- New columns on `issuers`: `issuer_type`, `wallet_status`, `identity_status`, `identity_verified_at`, `sumsub_applicant_id`

---

## Phase 2: Admin App UI

### 2a. Rename & split login

- App title: "Issuer Admin Portal"
- Login page shows two cards side by side:
  - **Platform Admin**: Login form only
  - **Issuer**: Login + Register tabs
    - Register tab message: "Requires pre-approval. Contact admin@cireta.io to get whitelisted"
    - Registration form: email, password, confirm password
    - If email not whitelisted: show clear error from API

### 2b. Admin whitelist management

New page: `/platform/issuers/whitelist`
- Form: email input + issuer type dropdown (Individual/Corporate) + Add button
- Table columns: Email, Type, Status (Pending/Registered), Added Date, Actions (Remove)

### 2c. Admin issuer detail (enhanced)

On issuer detail page (`/platform/issuers/[id]`):
- Three status pills: Identity (KYC/KYB), Wallet, Issuer Status
- Issuer type badge (Individual/Corporate)
- Wallet section:
  - Shows wallet address if connected
  - Approve / Reject wallet buttons
- Identity section:
  - Shows KYC or KYB status
  - Company name, jurisdiction (if corporate)
  - Verification date
- Activate button:
  - Enabled only when identity + wallet both approved
  - Disabled with tooltip showing missing gates

---

## Phase 3: Issuer Dashboard

### 3a. Onboarding checklist (primary view when not fully activated)

```
┌─────────────────────────────────────────────┐
│  Welcome, GoldCorp                           │
│  Complete these steps to start issuing       │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Connect Wallet   │  │  Verify Identity │ │
│  │                   │  │  (KYB required)  │ │
│  │  [Connect Wallet] │  │  [Start KYB]     │ │
│  │  ○ Not connected  │  │  ○ Not started   │ │
│  └──────────────────┘  └──────────────────┘ │
│                                              │
│  Admin Activation              ○ Waiting     │
│  (requires wallet + identity approval)       │
└─────────────────────────────────────────────┘
```

- Two equal cards, **no forced order** — issuer picks either first
- Wallet card states: Not connected → Connected (pending approval) → Approved / Rejected
- Identity card states: Not started → In progress → Under review → Approved / Rejected
  - Shows "KYC" for individual, "KYB" for corporate
  - Sumsub WebSDK embedded inline
- Bottom: Admin activation status (locked until both above are green)

### 3b. Add wagmi/RainbowKit to admin app

- Wallet connect button in issuer navbar (like launchpad)
- On connect: call `POST /api/v1/issuer/wallet` with signed message
- Signature verification proves wallet ownership

### 3c. Activated state

Once `issuer.status == ACTIVE`:
- Dashboard switches to normal issuer overview (tokens, sales, stats)
- No more onboarding checklist
- Green "Ready to deploy" indicator

### 3d. Deploy buttons gated

- "Deploy Token" and "Deploy Sale" buttons disabled if `issuer.status != ACTIVE`
- Tooltip on hover: "Complete onboarding to enable deployments"

---

## Phase 4 (Future): Issuer-Signed Deployments

- Switch from platform `DEPLOYER_PRIVATE_KEY` to issuer wallet signing
- Frontend sends TX to TokenFactory directly from issuer's connected wallet
- API records the result (contract address, tx hash) after deployment
- Platform no longer pays gas — issuer does

---

## File Changes Summary

### New files
- `apps/api/models/issuer_whitelist.py` — IssuerWhitelist model
- `apps/api/api/v1/endpoints/issuer_onboarding.py` — wallet + identity endpoints
- `apps/api/api/v1/endpoints/admin_whitelist.py` — whitelist CRUD
- `apps/api/schemas/issuer_whitelist.py` — request/response schemas
- `infra/alembic/versions/012_issuer_onboarding.py` — migration
- `apps/admin/src/app/platform/issuers/whitelist/page.tsx` — whitelist UI
- `apps/admin/src/app/issuer/onboarding/page.tsx` — onboarding checklist

### Modified files
- `apps/api/models/issuer.py` — new fields
- `apps/api/models/enums.py` — new enums (WalletStatus, IdentityStatus)
- `apps/api/services/issuer_service.py` — activation gates, wallet/identity methods
- `apps/api/services/auth_service.py` — whitelist check on registration
- `apps/api/api/v1/endpoints/admin_issuers.py` — wallet approve/reject, activation gates
- `apps/api/api/v1/router.py` — register new routes
- `apps/admin/src/app/login/page.tsx` — split admin/issuer login
- `apps/admin/src/app/page.tsx` — routing updates
- `apps/admin/src/app/platform/issuers/page.tsx` — enhanced issuer detail
- `apps/admin/src/app/issuer/overview/page.tsx` — onboarding redirect
