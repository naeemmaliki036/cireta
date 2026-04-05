# OTC & Bank Transfer — Implementation Report

**Date:** 2026-03-30
**Status:** Complete
**Addresses UX Strategy Gaps:** #1 (Fiat payment), #3 (OTC flow), #15 (OTC relationship management)

---

## Requirement

From UX Strategy Audit:
- **Gap #1 (Critical)**: No fiat payment path — blocks 70%+ of target audience (commodity investors don't have USDC)
- **Gap #3 (Critical)**: OTC checkout flow — backend `POST /sales/{id}/otc` exists but is issuer-side only, no investor-facing UI
- **Gap #15 (Partial)**: OTC relationship management — no "dedicated RM will contact you" flow, no premium tier feel

**Solution:** Add "OTC & Bank Transfer" as a per-sale rich content tab managed by issuers, with a platform-level default template and a payment method selector in the invest widget.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ PLATFORM LEVEL (Admin Settings)                         │
│                                                         │
│  otc_default_content = rich text template                │
│  (auto-loaded when issuer creates a sale,               │
│   editable per sale)                                    │
└────────────────────┬────────────────────────────────────┘
                     │ auto-copies to
                     ▼
┌─────────────────────────────────────────────────────────┐
│ PER SALE (Sale Content)                                 │
│                                                         │
│  sale.otc_enabled = true/false                          │
│  sale.otc_content = rich text (customized per sale)     │
│  (issuer can edit the default template for this sale)   │
└────────────────────┬────────────────────────────────────┘
                     │ displayed in
                     ▼
┌─────────────────────────────────────────────────────────┐
│ LAUNCHPAD (Investor-Facing)                             │
│                                                         │
│  Project page: New "OTC & Bank" tab                     │
│    → Renders sale.otc_content as rich HTML              │
│    → Shows bank details, wire instructions, process     │
│                                                         │
│  Invest widget: Payment method selector                 │
│    → "On-Chain (USDC)" — existing crypto flow           │
│    → "OTC & Bank Transfer" — links to OTC tab + CTA    │
└─────────────────────────────────────────────────────────┘
```

---

## What Was Built

### Database (Migration 017)

| Table | Field | Type | Purpose |
|---|---|---|---|
| `token_sales` | `otc_enabled` | `bool, default=false` | Toggle OTC option for this sale |
| `token_sales` | `otc_content` | `text, nullable` | Rich text HTML with bank/wire/OTC instructions |
| `platform_settings` | key=`otc_default_content` | `text` | Platform-level template auto-loaded into new sales |

### Backend

| File | Change |
|---|---|
| `apps/api/models/token_sale.py` | Added `otc_enabled` + `otc_content` fields |
| `apps/api/schemas/sale.py` | Added to `SaleCreateRequest` + `SaleResponse` |
| `apps/api/api/v1/endpoints/sales.py` | New `PUT /sales/{sale_id}/otc-content` endpoint, OTC fields in all sale GET responses |
| `apps/api/services/sale_create_service.py` | Auto-loads `otc_default_content` platform setting when OTC enabled on new sale |

### Admin Portal

| File | Change |
|---|---|
| `apps/admin/src/components/molecules/RichTextEditor.tsx` | New Tiptap rich text editor (bold, italic, H2/H3, bullet/numbered lists, links, blockquotes, horizontal rules) |
| `apps/admin/src/app/platform/settings/page.tsx` | "OTC & Bank Transfer Template" section with rich text editor + pre-filled default wire instructions + reset button |
| `apps/admin/src/app/issuer/sales/new/page.tsx` | OTC toggle in Step 1 (Sale Info) + rich text editor that auto-loads platform template when first enabled, shown in review summary |
| `apps/admin/src/lib/api/repositories/sales.ts` | Added `otc_enabled` + `otc_content` to `Sale` and `CreateSaleRequest` interfaces |

### Launchpad (Investor-Facing)

| File | Change |
|---|---|
| `apps/launchpad/src/lib/api/repositories/projects.repository.ts` | Added `otc_enabled` + `otc_content` to `SaleRaw` interface |
| `apps/launchpad/src/app/project/[slug]/page.tsx` | "OTC & Bank" tab (between Sale and Documents), only visible when `otc_enabled=true`, renders `otc_content` as styled HTML |
| `apps/launchpad/src/app/invest/[slug]/page.tsx` | Payment method selector before amount step: "On-Chain (USDC)" vs "OTC & Bank Transfer". OTC shows info card linking to project page instructions + OTC desk contact |

---

## UX Flows

### Issuer Creates Sale with OTC

1. Platform admin sets default OTC template in **Settings** (wire details, process steps, contacts)
2. Issuer creates new sale in admin portal
3. Toggles **"Enable OTC & Bank Transfer"** in Step 1
4. Rich text editor auto-loads platform template
5. Issuer customizes for this specific sale (adds sale-specific bank details, minimums, RM contact)
6. Saves and submits for approval
7. On approval, "OTC & Bank" tab appears on the investor-facing project page

### Investor Invests via OTC

1. Clicks **"Invest Now"** on a sale with OTC enabled
2. Sees payment method choice:
   - **On-Chain (USDC)** — existing crypto flow
   - **OTC & Bank Transfer** — fiat path
3. Selects OTC → sees info card:
   - "This sale accepts bank transfers and OTC payments"
   - Link to "OTC & Bank" tab on project page for wire details
   - OTC desk contact for allocations over $50,000
4. Follows wire instructions on project page
5. Completes bank transfer with specified reference
6. Issuer/admin manually confirms receipt and allocates tokens

### Default OTC Template (Pre-filled)

```html
<h2>OTC & Bank Transfer Instructions</h2>
<p>This sale accepts investments via bank wire transfer and OTC allocation.</p>

<h3>Wire Transfer Details</h3>
- Beneficiary: Cireta Holdings Ltd
- Bank: [Bank Name]
- IBAN: [IBAN]
- SWIFT/BIC: [SWIFT Code]
- Reference: Your registered email address

<h3>Process</h3>
1. Complete KYC verification on the platform
2. Initiate a wire transfer with the details above
3. Email confirmation to otc@cireta.com with your transfer receipt
4. Tokens will be allocated within 2-3 business days

<h3>Minimum Investment</h3>
Bank transfer minimum: $5,000

<h3>Large Allocations ($50,000+)</h3>
Contact our OTC desk directly:
- Email: otc@cireta.com
- Response time: Within 2 business hours
```

---

## E2E Tests

5 new tests added to `e2e-tests/run-all.sh`:

| Test | Description | Result |
|---|---|---|
| OTC1 | Enable OTC on sale via `PUT /sales/{id}/otc-content` | PASS |
| OTC2 | Sale GET response includes OTC data | PASS |
| OTC3 | `otc_enabled` flag is `true` in response | PASS |
| OTC4 | Disable OTC via same endpoint | PASS |
| OTC5 | Investor cannot update OTC content (403 RBAC) | PASS |

---

## How This Addresses UX Strategy Requirements

| UX Requirement | How Covered |
|---|---|
| Fiat payment path | Rich text OTC tab with wire/bank details per sale |
| OTC as premium experience | Issuer customizes per sale with rich editor, can add RM contact info |
| "Large Allocation" path | OTC instructions include direct contact for $50K+ |
| Fiat progress tracker | Described in OTC instructions (v1 — manual process) |
| Dual crypto/fiat in invest widget | Payment method selector before amount step |
| Platform-level template | Admin sets default in Settings, auto-loaded per sale |
| Per-sale customization | Issuer edits via rich text editor |

---

## What This Deliberately Defers

| Feature | Reason | Future Path |
|---|---|---|
| Automated fiat processing (Stripe/MoonPay) | Manual OTC covers the need for launch | Add fiat on-ramp integration when volume justifies |
| Fiat status machine (submitted → processing → confirmed) | Described in rich text for v1 | Build status tracker when automating fiat flow |
| Automated bank transfer detection | Manual confirmation by issuer/admin | Integrate bank API or payment processor |

---

## Updated Gap Status

| # | Gap | Previous Status | Current Status |
|---|---|---|---|
| 1 | Fiat payment (bank/wire) | Missing | **Covered** via OTC rich content |
| 2 | Fiat progress tracker | Missing | **Partially covered** (in OTC instructions) |
| 3 | OTC checkout flow | Missing | **Done** — payment selector + OTC tab |
| 15 | OTC relationship management | Partial | **Done** — per-sale content + OTC desk contact |
