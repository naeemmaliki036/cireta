# Sale Flow Gap Analysis

Comprehensive audit of current sale flow implementation vs required functionality.
Conducted: 2026-03-30

## 1. Sale Content Model — Token Optional

**Status: NOT in place — Major Gap**

### Current State
- `token_id` is **required** in `SaleCreateRequest`
- `create_sale` service **requires the token to be deployed on-chain** before a sale can be created
- Sale model has `token_id` as a non-nullable FK
- Sale inherits all display content (name, description, image) from the Token model

### Required State
Sales should work as standalone content pages (for "Coming Soon" / upcoming projects) where token info is optional.

### Missing Fields on TokenSale (or a new Project model)

| Field | Current | Needed |
|-------|---------|--------|
| Sale title | No (uses token name) | Yes — standalone title |
| Sale short description | No (uses token description) | Yes |
| Full description (rich HTML) | No | Yes — rich text editor content |
| Banner/hero image | No | Yes |
| Image gallery | No (single image_url on token) | Yes — multiple images |
| Team members | No | Yes — name, title, bio, photo |
| FAQs | No | Yes — question/answer pairs |
| Sale-level documents | Partial (TokenDocument model) | Yes — docs tied to sale |
| Issuer display name | Yes (from joined issuer) | Yes |
| Category/tags | No | Optional |

### New Models Required

```
SaleTeamMember:
  sale_id (FK), name, title, bio, photo_url, sort_order

SaleFAQ:
  sale_id (FK), question, answer, sort_order

SaleImage:
  sale_id (FK), url, caption, sort_order, is_banner (bool)

SaleDocument:
  sale_id (FK), name, doc_type, url, ipfs_hash
```

### Schema Changes
- `token_id` becomes nullable on TokenSale
- `SaleCreateRequest` no longer requires `token_id`
- Remove deployed-token requirement for sale creation
- Add new fields: title, description, full_description, banner_image_url

### Frontend
- Admin sale creation form needs: rich text editor (TipTap/Lexical), image upload, team member form, FAQ editor, document upload
- Launchpad project page needs: tabbed layout (Overview, Documents, Team, FAQ) matching production reference

---

## 2. Admin Approval Flow for Sales

**Status: NOT in place**

### Current State
- Sales go from `DRAFT` → `ACTIVE` automatically when issuer deploys on-chain
- No admin approval step exists
- No `PENDING_APPROVAL` status in `SaleStatus` enum
- Public listing returns all sales regardless of approval

### Required State
Admin must approve a sale before it becomes visible on the launchpad.

### Implementation Needed

1. Add `PENDING_APPROVAL` and `APPROVED` to `SaleStatus` enum
2. New status flow:
   ```
   DRAFT → (issuer submits) → PENDING_APPROVAL → (admin approves) → APPROVED → (issuer deploys) → ACTIVE
   ```
3. New admin endpoint: `POST /admin/sales/{sale_id}/approve`
4. New admin endpoint: `POST /admin/sales/{sale_id}/reject` (with reason)
5. Public sale listing (`GET /sales/`) filters to only show `ACTIVE` status
6. Admin sale listing shows all statuses
7. Notification to admin when issuer submits for approval
8. Notification to issuer when admin approves/rejects

---

## 3. Admin-Only Sale Finalization

**Status: NOT in place**

### Current State
- Issuers finalize their own sales
- `finalize_sale()` checks `issuer.user_id == user_id`
- No admin role check

### Required State
Only platform admins can finalize sales.

### Implementation Needed
1. Change `POST /sales/{sale_id}/finalize` auth from issuer ownership to `RequireAdmin`
2. Optionally keep issuer ability to *request* finalization (status change to `PENDING_FINALIZATION`)
3. Admin reviews and executes finalization

---

## 4. Token Creation & Deployment — Issuers Only

**Status: Mostly in place**

### Current State
- Only users with an active `Issuer` record can create tokens
- Issuer must be `is_active`
- Token symbol must be globally unique

### Minor Gap
- No explicit `UserRole.ISSUER` check — relies on `Issuer` DB record existence
- An admin could theoretically create an Issuer record for themselves and create tokens
- This is architecturally fine but worth noting

---

## 5. Token Recovery & Forced Transfer

**Status: IN PLACE at smart contract level**

### Smart Contract (CiretaToken.sol)
- `recoveryAddress(lostWallet, newWallet, investorOnchainID)` — requires `RECOVERY_ROLE`
  - Transfers full balance from lost → new wallet
  - Transfers frozen status
  - Verifies new wallet is identity-verified
- `forcedTransfer(from, to, amount)` — requires `AGENT_ROLE`
  - Bypasses compliance checks
  - Unfreezes tokens from source automatically

### Backend Endpoints (admin_compliance.py)
- `POST /compliance/forced-transfer` — issuer or admin
- `POST /compliance/recover` — issuer or admin
- `POST /compliance/freeze` / `unfreeze`
- `POST /compliance/pause/{token_id}`

### Gap to Verify
- Backend `recover_tokens` may only do a simple transfer, not the full `recoveryAddress()` call with identity swap
- Need to verify the Web3 service implementation matches the contract's `recoveryAddress` function signature

---

## 6. OTC Flow

**Status: Partially in place (DB-only, no on-chain execution)**

### Current State
- Backend-only OTC: creates a `Contribution` record with `is_otc=True`
- No on-chain token transfer or minting
- No KYC check on investor wallet
- No hard cap enforcement
- Synthetic tx_hash (not real)
- Fee-exempt (issuers could route deals to avoid fees)

### Required State
See separate document: `docs/OTC_TOKEN_PLAN.md`

---

## 7. Rich Project Page (Launchpad)

**Status: NOT in place**

### Reference (launchpad.cireta.com production)
The production site has a full project page with tabs:
- **Offerings** — sale phases, pricing, progress
- **Documents** — legal docs, audit reports
- **Team** — team members with photos, bios, titles
- **FAQ** — accordion Q&A

Sale detail page has:
- **Overview** — rich text with headings (Detail, Basic Info, Service Providers, Regulatory Framework)
- **Sale** — dates, caps, min/max, vault tokens, fraction contract info
- **My Position** — vesting schedule, claiming table
- **Transactions** — full tx history with operation badges

### Current Local State
- Basic project page at `/project/[slug]/page.tsx` — minimal card
- No tabs
- No team section
- No FAQ section
- No rich text content
- No image gallery/carousel
- No vesting/position view
- No transaction history

### Implementation Needed
- Tabbed layout component
- Rich text renderer for `full_description` HTML
- Team member cards
- FAQ accordion
- Image gallery/carousel
- Sale details panel
- Vesting schedule display
- Transaction history table with operation badges (Purchase, Purchase (OTC), Finalized, Withdraw, etc.)

---

## 8. Admin Portal — Sale Management

**Status: Partial**

### Current State
- Can create sales (basic form: token, caps, phases)
- Can deploy sales on-chain
- No approval workflow UI
- No rich content editing

### Required State
- Sale creation with full content (rich text, images, team, FAQ, docs)
- Approval queue for pending sales
- Approve/reject actions with comments
- Finalization controls (admin-only)
- OTC token deployment per issuer

---

## Implementation Status (Updated 2026-03-30)

| # | Item | Status |
|---|------|--------|
| 1 | Sale content model (DB + migration) | **DONE** — token_id nullable, title/description/full_description/banner fields, 4 new models, migration 013 |
| 2 | Admin approval flow | **DONE** — PENDING_APPROVAL/APPROVED/REJECTED statuses, admin approve/reject endpoints, issuer submit-for-approval endpoint |
| 3 | Admin-only finalization | **DONE** — POST /admin/sales/{id}/finalize with RequireAdmin |
| 4 | Rich project page (launchpad frontend) | **DONE** — tabbed layout (Overview, Sale, Documents, Team, FAQ, My Position, Transactions), image gallery, FAQ accordion |
| 5 | Admin sale creation form (rich content) | **DONE** — 6-step wizard (details, content, phases, team, FAQ/docs, review), save-as-draft at any step, submit for approval |
| 6 | OTC token contracts + integration | **DONE** — IssuerOTCToken.sol, IssuerOTCTokenFactory.sol, buyOTC() in Sale.sol, migration 014, issuer model otc_token_address |
| 7 | Recovery endpoint verification | **DONE** — refactored to dApp-first (no backend private key), endpoints now record audit with tx_hash |
| 8 | Transaction history + badges | **DONE** — integrated into project page Transactions tab |

### Key Architectural Decision
- **Sales created by issuers only** — admin cannot create sales
- **Admin approves visibility** — admin reviews and approves sales for launchpad listing
- **On-chain actions via dApp** — no backend private key; compliance actions (freeze, recover, pause) executed via user's connected wallet, backend records audit log with tx_hash
