# Admin Portal Changes — 2026-03-29

## Summary

Renamed to **Cireta Issuer Admin Portal**. Split into Platform Admin and Issuer views with role-based routing. Implemented issuer onboarding flow with whitelist, wallet approval, identity verification, and activation gates.

---

## 1. Login Screen Redesign

- **Split login**: Two role cards on entry — "Platform Admin" and "Issuer"
- **Platform Admin**: Login form only
- **Issuer**: Login + Register tabs
  - Register requires email whitelisting (enforced server-side)
  - Shows pre-approval message with contact email
- **Separate API endpoints**:
  - `POST /api/v1/auth/register` — investor registration (launchpad)
  - `POST /api/v1/auth/register/issuer` — issuer registration (whitelist enforced, creates Issuer record)

## 2. Issuer Onboarding Flow

### Backend (new endpoints)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register/issuer` | Issuer registration (whitelist enforced) |
| POST | `/api/v1/admin/issuers/whitelist` | Add email to whitelist |
| GET | `/api/v1/admin/issuers/whitelist` | List whitelist |
| DELETE | `/api/v1/admin/issuers/whitelist/{id}` | Remove from whitelist |
| GET | `/api/v1/admin/issuers/{id}` | Get single issuer |
| POST | `/api/v1/admin/issuers/{id}/approve-wallet` | Approve wallet |
| POST | `/api/v1/admin/issuers/{id}/reject-wallet` | Reject wallet |
| POST | `/api/v1/admin/issuers/{id}/skip-identity` | Admin override: skip KYC/KYB |
| POST | `/api/v1/issuer/wallet` | Submit wallet address |
| POST | `/api/v1/issuer/identity/initiate` | Start KYC/KYB |
| GET | `/api/v1/issuer/identity/status` | Check verification status |
| GET | `/api/v1/issuer/onboarding-status` | All gates in one call |

### New models

- `IssuerWhitelist` — pre-approved issuer emails with type (individual/corporate)
- `Issuer` model additions: `issuer_type`, `wallet_status`, `identity_status`, `identity_verified_at`, `sumsub_applicant_id`
- New enums: `WalletApprovalStatus`, `IdentityVerificationStatus`, `IssuerType`

### Deploy gates

Token and sale deploy endpoints now check `issuer.status == ACTIVE` and return `ISSUER_NOT_ACTIVE` if not.

### Activation gates

Admin cannot activate an issuer unless:
- Wallet status = APPROVED
- Identity status = APPROVED

Activation also syncs `User.role = ISSUER`. Revocation syncs back to `INVESTOR`.

## 3. Admin UI — Platform Views

### Issuer Management (`/platform/issuers`)
- Stats: total, active, pending, total raised
- Table with columns: Issuer, Type, Wallet status, Identity status, Status, Fee, View
- "Manage Whitelist" button in header

### Issuer Detail (`/platform/issuers/[id]`)
- Header with issuer info, type badge, status
- Three gate cards: Wallet (approve/reject), Identity (KYC/KYB + skip button), Activation
- Sales table showing all sales by this issuer

### Whitelist Management (`/platform/issuers/whitelist`)
- Add form: email + issuer type (individual/corporate)
- Table: email, type, status (pending/registered), date, remove action

### Platform Tokens (`/platform/tokens`)
- Stats: total, deployed, draft
- Table: name, symbol, asset type, supply, status, contract address, created date

### Platform Sales (`/platform/sales`)
- Stats: total, active, total raised
- Table: token, issuer, status, raised, hard cap, progress bar, phases

### Settings (`/platform/settings`)
- Fixed: now uses PlatformAdminLayout (was missing sidebar)
- Fields: default fee rate, blocked countries, min KYC level

### Users (`/platform/users`)
- Fixed: was calling wrong API endpoint
- Now uses `/api/v1/admin/investors/` with correct response shape

## 4. Issuer UI

### Onboarding Checklist (`/issuer/overview` when not activated)
- Two cards (no forced order): Connect Wallet, Verify Identity (KYC/KYB)
- Admin Activation status at bottom
- Switches to normal dashboard once `issuer.status == ACTIVE`

### Wallet Submission (`/issuer/onboarding/wallet`)
- Form to enter Ethereum address
- Submits for admin approval
- Success state with confirmation

### Identity Verification (`/issuer/onboarding/identity`)
- Shows KYC or KYB based on `issuer_type`
- Embeds Sumsub WebSDK
- States: loading, ready, sdk, processing, approved, rejected, error

## 5. General Fixes

- **Sidebar colors**: Fixed dark-on-dark text issue in both IssuerDashboardLayout and PlatformAdminLayout using inline styles
- **Disconnect button**: Now functional — calls logout API and redirects to login
- **Wallet header button**: Links to onboarding wallet page
- **Root page routing**: Fixed — now calls `/api/v1/auth/me` to check role instead of parsing JWT (which had no role field)
- **Port assignments**: API=3010, Launchpad=4010, Admin=5010
- **Env fallbacks removed**: All env vars strictly required, no hardcoded fallbacks
- **Token creation wizard**: Removed Documentation step (moved to sale creation), now 3 steps
- **Sale creation wizard**: New page with 4 steps (details, phases, documentation, review)
- **Chainlink PoR removed** from token creation form
- **"Base Mainnet" references** replaced with "Ethereum Sepolia" / "on-chain"
- **Auto-fill button** on token creation (dev mode only)

## 6. Migration

`infra/alembic/versions/012_issuer_onboarding.py`:
- Creates `issuer_whitelist` table
- Adds 5 columns to `issuers` table

## 7. Files Changed/Created

### New files
- `apps/api/models/issuer_whitelist.py`
- `apps/api/api/v1/endpoints/issuer_onboarding.py`
- `infra/alembic/versions/012_issuer_onboarding.py`
- `apps/admin/src/app/api/auth/register/route.ts`
- `apps/admin/src/app/platform/issuers/whitelist/page.tsx`
- `apps/admin/src/app/platform/issuers/[id]/page.tsx`
- `apps/admin/src/app/platform/tokens/page.tsx`
- `apps/admin/src/app/platform/sales/page.tsx`
- `apps/admin/src/app/issuer/onboarding/wallet/page.tsx`
- `apps/admin/src/app/issuer/onboarding/identity/page.tsx`
- `apps/admin/src/app/issuer/sales/new/page.tsx`
- `apps/admin/src/lib/api/repositories/issuer-onboarding.ts`

### Modified files
- `apps/api/models/enums.py` — new enums
- `apps/api/models/issuer.py` — new fields
- `apps/api/models/__init__.py` — exports
- `apps/api/schemas/auth.py` — removed require_whitelist flag
- `apps/api/schemas/admin.py` — enhanced IssuerResponse, whitelist/onboarding schemas
- `apps/api/services/issuer_service.py` — full rewrite with onboarding logic
- `apps/api/services/auth_service.py` — split register/register_issuer
- `apps/api/api/v1/endpoints/auth.py` — added register_issuer endpoint
- `apps/api/api/v1/endpoints/admin_issuers.py` — whitelist CRUD, wallet approve/reject, skip identity, get single issuer
- `apps/api/api/v1/endpoints/sales.py` — deploy gate
- `apps/api/services/token_service.py` — deploy gate
- `apps/api/api/v1/router.py` — new router
- `apps/admin/src/app/login/page.tsx` — split login redesign
- `apps/admin/src/app/page.tsx` — role-based routing via API
- `apps/admin/src/app/issuer/overview/page.tsx` — onboarding checklist
- `apps/admin/src/app/platform/issuers/page.tsx` — whitelist button, new columns
- `apps/admin/src/app/platform/settings/page.tsx` — uses PlatformAdminLayout
- `apps/admin/src/app/platform/users/page.tsx` — fixed API endpoint
- `apps/admin/src/components/templates/IssuerDashboardLayout.tsx` — sidebar colors, disconnect, wallet link
- `apps/admin/src/components/templates/PlatformAdminLayout.tsx` — sidebar colors, disconnect, new nav links
- `apps/admin/src/lib/issuerColumns.tsx` — new columns, link to detail
- `apps/admin/src/lib/api/repositories/issuers.ts` — updated interface, getIssuer
- `apps/admin/src/lib/api/repositories/sales.ts` — createSale, deploySale
- `apps/admin/src/lib/api/client.ts` — apiDelete
- `apps/admin/src/lib/tokenFormSteps.tsx` — removed Documentation step, Chainlink PoR
