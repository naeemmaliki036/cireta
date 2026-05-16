# Post-Demo Fix Batch — 2026-05-15

Five fixes / enhancements decided after the team demo. All on `sandbox`,
not yet pushed.

---

## 1. Corporate KYB → IR auto-register

**Gap.** `kyc_service.handle_corporate_webhook` sets `kyc_status=approved`
and `kyc_level=4` on a GREEN review but never calls `_issue_onchain_claims`.
Retail (KYC) does. So a corporate investor who passes KYB on the Sumsub
side ends up with `registered_on_chain=False` on every wallet, and their
wallets are silently un-whitelisted on the SimpleIdentityRegistry.

**Fix.** After `await self.db.commit()` in `handle_corporate_webhook`, call
`await self._issue_onchain_claims(user)` inside a `try/except` mirroring
the retail path (`handle_webhook`). Catch + log + write an audit row
`action="identity_sync_inline_failed"`. Don't raise — the user is still
approved, the failure is recoverable via Resync IR.

**Touches.** `apps/api/services/kyc_service.py` only. No migration.

---

## 2. Wallet `register_tx_hash` + `registered_at`

**Gap.** When a wallet is whitelisted on-chain, the only place the tx hash
is recorded is on the matching `IdentitySyncJob` row (for the queued path)
or in the audit log payload. There is no `register_tx_hash` column on the
wallet itself, so the admin UI can't show a "✓ registered · tx 0x123…"
proof link next to a wallet. Likewise no `registered_at`.

**Fix.**

- New columns on `apps/api/models/wallet.py`:
  - `register_tx_hash: String(66) | None` — plain, since tx hashes are public
  - `registered_at: DateTime | None`
- Alembic migration `051_wallet_register_tx_hash.py`.
- Write sites:
  - `SimpleIdentityBridgeService.provision_identity` / `register_wallet` — set both fields when the `addToWhitelist` receipt confirms.
  - `POST /api/v1/admin/wallets/{id}/mark-registered` — already called from `RegisterWalletModal`; extend its body to accept `tx_hash` and persist both columns.
- Read sites:
  - `/platform/users/[id]` wallet row — show "registered ·tx 0x123…" link next to the shield.
  - `/admin/wallets` (if present) — column.

Not backfilling existing rows.

---

## 3. Complete redemption widget info (launchpad Redeem tab)

**Gap.** Today the inline Redeem tab on `/project/[slug]` shows: amount,
fulfillment_method, created_at, status, tx_hash, cancel button. Missing:
on-chain id, tracking number, shipped_at, fulfilled_at, delivery
recipient/address/phone (when physical), notes/rejection reason.

**Fix.**

- Extract the inline rows (project page lines 1715-1755) into a new
  molecule: `apps/launchpad/src/components/molecules/RedemptionHistoryRow.tsx`.
- Render: amount + symbol · method tag · status pill · created date.
  Below: on-chain id, tracking #, shipped_at, fulfilled_at when set.
  Below that: delivery card (recipient, address, phone) when physical.
  Bottom: burn tx link (block explorer) when `tx_hash` set.
- Extend `RedemptionRequest` type in `portfolio.repository.ts` with the
  missing fields (`onchain_id`, `token_name`, `token_contract_address`,
  `redemption_manager_address`).
- Backend: extend `_redemption_to_response` in `apps/api/api/v1/endpoints/portfolio.py`
  to expose `onchain_id`, `token_name`, `token_contract_address`,
  `redemption_manager_address`, `notes`, `rejection_reason`.

---

## 4. Hash-based tab routing on `/project/[slug]`

**Gap.** Today tab state is `useState<Tab>("Overview")` with no URL
binding. `/project/best-tube-production-morocco#otc` ignores the hash
and lands on Overview. Direct links into a specific tab don't work.

**Fix.** Bidirectional hash sync:

- Build a `tabKeyMap` from human tab labels to URL-safe slugs:
  `Overview → overview`, `Token & Sale → token-sale`, `Team → team`,
  `FAQ → faq`, `Documents → documents`, `Vesting → vesting`,
  `Redeem → redeem`, `My Position → my-position`,
  `Transactions → transactions`, `OTC & Bank → otc`.
- On mount and on `hashchange`, read `window.location.hash.slice(1)`
  and `setActiveTab(reverseMap[slug])` when the slug is valid for the
  current sale shape (skip Vesting if not vested, etc.).
- When `setActiveTab` is called by a tab button, also call
  `history.replaceState(null, "", \`#\${slug}\`)`. `replaceState` (not
  `pushState`) — clicking tabs shouldn't pollute the browser history.
- Encapsulate as a small hook `useHashTab(tabs)` co-located with the
  project page for now (single user).

---

## 5. Shipping address book + cross-country flag

**Goal.** Investors pick a shipping address from their saved book when
requesting a *physical* redemption, or enter a new one with the option
to save it. The issuer reads that address from the redemption row. Flag
(soft warning, no block) if the shipping country differs from the
investor's verified country of residence (retail) or company
jurisdiction (corporate).

### Data model

New table `shipping_addresses`:

| column           | type              | enc | nullable | notes |
|------------------|-------------------|-----|----------|-------|
| id               | UUID PK           |     |          |       |
| user_id          | UUID FK users.id  |     |          | cascade delete |
| label            | EncryptedString   | yes | yes      | user-chosen ("Home", "Office") |
| recipient_name   | EncryptedString   | yes |          |       |
| line1            | EncryptedString   | yes |          |       |
| line2            | EncryptedString   | yes | yes      |       |
| city             | EncryptedString   | yes |          |       |
| region           | EncryptedString   | yes | yes      | state/province |
| postal_code      | EncryptedString   | yes |          |       |
| country          | String(3)         | no  |          | ISO 3166-1 alpha-3 — needed for cross-country flag, not sensitive on its own |
| phone            | EncryptedString   | yes |          |       |
| is_default       | Boolean           | no  |          | only one true per user; enforced in service layer |
| notes            | EncryptedString   | yes | yes      |       |
| created_at       | DateTime          | no  |          |       |
| updated_at       | DateTime          | no  |          |       |

Migration `052_shipping_addresses.py`.

### Backend endpoints

All under `/api/v1/me/shipping-addresses` (authenticated, scoped to caller):

- `GET    /api/v1/me/shipping-addresses` — list mine.
- `POST   /api/v1/me/shipping-addresses` — create. Body matches columns; default false unless body says otherwise; if `is_default=true`, clear all others in a single tx.
- `PATCH  /api/v1/me/shipping-addresses/{id}` — partial update; same default-clearing rule.
- `DELETE /api/v1/me/shipping-addresses/{id}` — hard delete (encrypted columns make soft-delete pointless for compliance). Reject if it's the only address attached to a non-terminal redemption — return 409 with code `IN_USE`.

New repository `apps/launchpad/src/lib/api/repositories/shipping-addresses.ts`.

### Redemption flow

- Extend `redemption_requests` with `shipping_address_id` (nullable
  FK → shipping_addresses.id). Migration `053_redemption_shipping_address.py`.
- Existing `delivery_name / delivery_address / delivery_phone` columns
  stay as the immutable snapshot of what the user submitted (so editing
  the address book later doesn't rewrite past redemptions). Service
  copies fields from the picked book row at create time.
- `RedemptionRequestModal` (launchpad) — when `fulfillment=physical`:
  - Show book picker (radio list of existing addresses, "Add new" at
    the bottom).
  - "Add new" reveals the form; checkbox **"Save to my address book"**
    (checked by default). On submit: if checked, POST the book row first,
    then create the redemption with `shipping_address_id`; if unchecked,
    just inline the fields into the redemption.
  - Inline soft-warning when the chosen address's country differs from
    the user's residence/jurisdiction country: "Heads up — this address
    is in *X*, but your verified country is *Y*. The issuer may ask for
    additional documentation." No blocking.

### Cross-country flag computation

Server-side, on the redemption-create path:

- Resolve the user's "home country":
  - Retail: `users.verified_country_of_residence` (fallback to `country_of_residence`).
  - Corporate (`kyc_type == "corporate"`): `users.verified_company_jurisdiction` (fallback to `company_jurisdiction`).
- Compare to the picked shipping country (alpha-3).
- Persist a denormalised `shipping_country_mismatch: Boolean` on the
  redemption row. Cheap to read on the issuer dashboard without joining.
- Surface in the issuer-side redemption card as a small yellow chip:
  "⚠ Country mismatch — shipping *X*, home *Y*". Soft only.

### Address book management page

New page `/settings/addresses` on launchpad. Lists rows from
`GET /api/v1/me/shipping-addresses`, with "Add address", per-row Edit /
Delete / Set default. Add link in `SETTINGS_LINKS` in
`DashboardLayout.tsx` (between Wallets and Verification).

---

## Out of scope for this batch

- Backfilling `register_tx_hash` from `IdentitySyncJob` for existing wallets
- Encrypted-search support over the address book
- Issuer-side bulk-mark-shipped from a CSV of tracking numbers
- Multi-region defaults (one default per country)
