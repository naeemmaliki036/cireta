# Session Update — 2026-03-29 to 2026-03-30

Comprehensive record of all changes made across backend, frontend, smart contracts, and documentation.

---

## 1. Launchpad Frontend Fixes

### Navbar
- Added `top-0` to fix header gap from viewport top
- Reduced padding: `py-6 md:py-8` → `py-3 md:py-4` (not scrolled), `py-4` → `py-2` (scrolled)
- Logo size: `h-[112px]` → `h-10` (40px) — was massively oversized

### Route Rename
- Renamed `/explore` → `/projects` across all files (13 files updated)
- Moved `apps/launchpad/src/app/explore/` → `apps/launchpad/src/app/projects/`

### Home Icon Removal
- Removed redundant Home icon from sidebar on 4 pages (explore, portfolio, verify, project/[slug])
- Cleaned up unused `Home` imports

### Projects Page
- Removed `max-w-5xl` constraint — content now uses full width
- Redesigned cards to match reference: taller images (h-72/h-64), inset rounded images, larger text, bigger buttons
- Sidebar widened to w-56, larger logo

### QuickTourModal
- "How To?" button no longer reloads the page — uses custom `open-quick-tour` event instead

### Favicon
- Copied favicon.ico to admin portal (`apps/admin/public/favicon.ico`)

---

## 2. Seed Script Update

**File**: `scripts/seed_db.py`

Replaced all users with standardized test accounts:

| Email | Role | KYC Status | Password |
|-------|------|------------|----------|
| admin@cireta.com | Admin | Approved | Password@123 |
| issuer+test@cireta.com | Issuer | Approved | Password@123 |
| investor+verified@cireta.com | Investor | Approved | Password@123 |
| investor+pending@cireta.com | Investor | Pending | Password@123 |
| investor+rejected@cireta.com | Investor | Rejected | Password@123 |

All references updated (issuer profile, contribution records).

---

## 3. Sale Content Model — Token Optional

### New Fields on TokenSale
- `title` (String 255)
- `description` (String 2000)
- `full_description` (Text — rich content)
- `banner_image_url` (String 500)
- `is_coming_soon` (Boolean, default false)
- `cliff_duration_days` (Integer, default 0)
- `vesting_duration_days` (Integer, default 365)
- `sale_structure` (String 20, default "phase_allocated")
- `token_id` made **nullable** — allows "coming soon" / prelisting sales without a deployed token

### New Models
- `SaleTeamMember` — name, title, bio, photo_url, sort_order
- `SaleFAQ` — question, answer, sort_order
- `SaleImage` — url, caption, is_banner, sort_order
- `SaleDocument` — name, doc_type, url, ipfs_hash

### New Endpoints
- `GET/POST/DELETE /sales/{id}/team` — CRUD for team members
- `GET/POST/DELETE /sales/{id}/faqs` — CRUD for FAQs
- `GET/POST/DELETE /sales/{id}/images` — CRUD for images
- `GET/POST/DELETE /sales/{id}/documents` — CRUD for documents

### Migrations
- `013_sale_content_and_approval` — content fields + 4 new tables
- `015_coming_soon_and_vesting` — is_coming_soon, vesting config, widen status column
- `016_sale_structure` — sale_structure column

---

## 4. Sale Status & Approval Flow

### New Statuses Added
- `PENDING_APPROVAL` — issuer submitted, awaiting admin review
- `APPROVED` — admin approved, issuer can deploy on-chain
- `APPROVED_COMING_SOON` — admin approved prelisting, visible on launchpad without buy button
- `REJECTED` — admin rejected with reason

### Status Flow
```
DRAFT → PENDING_APPROVAL → APPROVED → (deploy on-chain) → ACTIVE → FINALIZED_SUCCESS/FAILED
                │                                                         │
                └→ REJECTED                              APPROVED_COMING_SOON → (convert) → DRAFT → ...
```

### Endpoints
- `POST /sales/{id}/submit-for-approval` — issuer submits draft for review
- `POST /admin/sales/{id}/approve` — admin approves (routes to APPROVED or APPROVED_COMING_SOON based on is_coming_soon)
- `POST /admin/sales/{id}/reject` — admin rejects with optional reason
- `POST /admin/sales/{id}/finalize` — admin-only finalization
- `POST /sales/{id}/convert-to-live` — issuer converts coming-soon to draft for adding token/phases/caps
- `GET /admin/sales/` — admin listing (all statuses)
- Public `GET /sales/` now only returns ACTIVE + APPROVED_COMING_SOON

### Key Rules
- **Issuers create sales** — admin cannot create
- **Admin approves visibility** — controls what appears on launchpad
- **Admin finalizes sales** — issuer cannot finalize
- **Deploy gate** — on-chain deployment requires APPROVED or DRAFT status

---

## 5. Sale Structure Types

### Two Modes
- **Phase Allocated** (default) — each phase has its own token allocation cap, enforced on-chain
- **Price Tiered** — 100% allocation shared across phases, phases only change price. Only global hard cap enforced.

### Min Contribution Change
- **First purchase only** — min contribution enforced only on first buy (universal for both structures). After initial purchase, investor can top up any amount.

### Contract Changes (Sale.sol)
- Added `SaleStructure` enum: `PhaseAllocated` / `PriceTiered`
- Added `saleStructure` state variable + `setSaleStructure()` setter
- `buy()` and `buyOTC()` updated: per-phase allocation check skipped in PriceTiered mode
- `maxContribution` check now skips when set to 0 (unlimited)

---

## 6. Finalization & Withdrawal Separation

### Before
`_finalize()` transferred platform fee AND issuer funds in one transaction.

### After
- `finalizeSale()` — issuer or owner (admin). Calculates fee → transfers fee to feeManager → starts vesting. **Funds stay in contract.**
- `withdrawFunds()` — NEW. Issuer/owner calls separately to withdraw remaining USDC. Only after FinalizedSuccess. Can be called multiple times.

### Contract Events Added
- `FundsWithdrawn(address indexed recipient, uint256 amount)`

### Contract Errors Added
- `NothingToWithdraw()`
- `SaleNotFinalized()`

---

## 7. OTC Token System

### Smart Contracts Created
- `contracts/src/otc/IssuerOTCToken.sol` — ERC-20 per-issuer OTC token
  - MINTER_ROLE for issuer, no fee at mint
  - Identity-gated transfers (recipient must be verified via IdentityRegistry)
  - 6 decimals (USDC parity)
  - UUPS upgradeable
- `contracts/src/otc/IssuerOTCTokenFactory.sol` — deploys per-issuer OTC tokens
  - Owner-only deployment
  - Mapping: issuerWallet → otcTokenAddress

### Sale.sol Updates
- Added `IssuerOTCToken public otcToken` state variable
- Added `buyOTC(phaseId, amount)` — same checks as `buy()`, burns OTC tokens, emits `Purchase(..., true)`
- Added `setOTCToken(address)` — owner-only setter
- `Purchase` event updated: added `bool isOTC` field

### Backend
- Added `otc_token_address` to Issuer model
- Migration `014_issuer_otc_token`

---

## 8. Contract Rename: contribute → buy

### Changes
- `Sale.sol`: `contribute()` → `buy()`, `ContributionMade` event → `Purchase` event
- `contributor` field → `buyer` in event + all backend services
- Updated: `event_listener_service.py`, `web3_sale_service.py`, `sale_contribute_service.py`
- Updated: `Sale.test.ts`, `e2e-smoke-test.ts`
- Updated: 3 test files (`test_event_listener_service.py`, `test_contribution_onchain.py`, `test_web3_sale_service.py`)

---

## 9. Compliance Endpoints — dApp-First

### Before
Backend tried to execute on-chain transactions via private key (Web3TokenService).

### After
All on-chain compliance actions executed via dApp (user's connected wallet). Backend only records audit log with `tx_hash`.

### Updated Endpoints
- `POST /compliance/forced-transfer` — accepts `tx_hash`, logs audit
- `POST /compliance/recover` — accepts `tx_hash` + `to_address`, logs audit
- `POST /compliance/pause/{token_id}` — accepts `tx_hash`
- `POST /compliance/unpause/{token_id}` — accepts `tx_hash`

---

## 10. Admin Portal — Sale Management UI

### Issuer Sale Detail Page (`/issuer/sales/[id]`)
- Status-dependent actions: Submit for Approval, Convert to Live, Deploy instructions, Withdraw funds instructions
- Status banners: pending, rejected, failed states
- Stats, progress bar, phases table

### Platform Admin Sale Detail Page (`/platform/sales/[id]`) — NEW
- Approve/Reject buttons with reason input
- Finalize Sale button (active sales only)
- Full sale details grid, phases table

### Admin Sale Creation Wizard — Rewritten (8 Steps)
```
Step 1: Sale Info        — title, description, Prelisting toggle, sale mode, sale structure
Step 2: Content          — full description, banner image
Step 3: Team             — add/remove team members
Step 4: FAQ & Docs       — add/remove FAQs and documents
Step 5: Phases           — (SKIPPED if prelisting)
Step 6: Token & Caps     — (SKIPPED if prelisting)
Step 7: Vesting          — cliff + vesting days (SKIPPED if prelisting or direct mode)
Step 8: Review           — summary, Save Draft / Submit for Approval
```
- Save as Draft available on every step
- Steps dynamically shown/hidden based on prelisting toggle and sale mode
- Progress bar adapts to visible steps

---

## 11. Launchpad — Rich Project Page

### Project Detail (`/project/[slug]`)
- Rewritten with tabbed layout: Overview, Sale, Documents, Team, FAQ, My Position, Transactions
- Image gallery with thumbnails and selected state
- Overview: renders `full_description` as HTML, token details grid
- Sale: stats grid, phases table, vault info
- Documents: fetched from `/sales/{id}/documents` API
- Team: fetched from `/sales/{id}/team` API, 2-column grid with avatar/initials
- FAQ: fetched from `/sales/{id}/faqs` API, accordion with chevron toggle
- Right sidebar: funding stats, progress bar, status badge, Buy button

### Projects Page
- Coming Soon projects now fetched from API (`APPROVED_COMING_SOON` status) instead of hardcoded array
- Projects split into active vs coming_soon from single API response

---

## 12. Documentation Created

| File | Type | Content |
|------|------|---------|
| `docs/GAP_SALE_FLOW_ANALYSIS.md` | Gap | Sale flow audit — all 8 items now DONE |
| `docs/GAP_FULL_SYSTEM_AUDIT.md` | Gap | 33 issues across backend, contracts, frontend |
| `docs/NEW_OTC_TOKEN_PLAN.md` | New | Complete OTC token design with flow diagrams |
| `docs/IMP_ADMIN_PORTAL_CHANGES_20260329.md` | Improvement | Admin portal changes record |
| `docs/IMP_HOMEPAGE_REDESIGN.md` | Improvement | Homepage redesign spec |

---

## 13. Database Migrations Summary

| # | Name | Changes |
|---|------|---------|
| 013 | sale_content_and_approval | token_id nullable, title/description/full_description/banner, 4 new tables |
| 014 | issuer_otc_token | otc_token_address on issuers |
| 015 | coming_soon_and_vesting | is_coming_soon, cliff/vesting days, widen status column |
| 016 | sale_structure | sale_structure column |

---

## 14. Test Results

- **Backend**: 230/230 passing
- **Contract compilation**: All Solidity files compile successfully
- **App import check**: `from apps.api.main import app` — OK

---

## 15. Files Changed/Created Summary

### New Files (30+)
- 4 new SQLAlchemy models (sale_team_member, sale_faq, sale_image, sale_document)
- 2 new API endpoint files (admin_sales.py, sale_content.py)
- 4 new Alembic migrations (013-016)
- 2 new Solidity contracts (IssuerOTCToken.sol, IssuerOTCTokenFactory.sol)
- 1 new admin page (platform/sales/[id])
- 6 documentation files

### Modified Files (87 total per git diff)
- Backend: models, schemas, services, endpoints
- Frontend: pages, components, repositories, config
- Contracts: Sale.sol, tests, scripts
- Infrastructure: seed script, migrations

### Key Architectural Decisions
1. **No backend private key** — all on-chain actions via dApp
2. **Issuers create, admin approves** — clear separation of duties
3. **Prelisting (coming soon)** explicitly marked by issuer, approved by admin
4. **Two sale structures** — phase-allocated and price-tiered
5. **Separate finalize and withdraw** — fee goes to platform on finalize, funds stay until issuer withdraws
6. **OTC via per-issuer ERC-20 token** — identity-gated, burned on purchase
7. **Min contribution first-purchase-only** — allows top-ups of any amount
