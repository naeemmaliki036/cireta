# Redemption Everywhere — 2026-05-16

## Why

Today the only way to start a redemption is `/project/[slug]#redeem`. A
user with five holdings has to remember which project a balance belongs
to, navigate back to that sale page, click the Redeem tab, then submit.
The Redeem affordance also doesn't exist anywhere on `/portfolio` or
`/account`, so the cross-token "what have I redeemed so far?" question
has no single answer.

This change makes redemption a first-class portfolio action.

## What

### 1. Per-holding Redeem button on `/portfolio`

In `PortfolioTable.HoldingRow`, when:

- `h.is_redeemable === true` (already on `HoldingResponse`), AND
- `h.redemption_manager_address` is set (NEW field, see §3), AND
- `h.contract_address` is set,

render a **Redeem** action button next to the existing Claim/View slot.
Click opens `RedemptionRequestModal` directly with the holding's
`tokenAddress`, `tokenSymbol`, `tokenId`, `redemptionManagerAddress` —
the modal already does its own balance read, address picker, etc.

The button is hidden when redemption isn't configured for the token, so
the row layout doesn't reserve space for an inert affordance.

### 2. New cross-token page `/portfolio/redemptions`

Mirrors the `/portfolio/transactions` shell (DashboardLayout wrapper,
filter row, paginated table, refresh button, optional info sidebar).

- Data source: existing `GET /api/v1/portfolio/redemptions` (already
  returns every row for the user, no token filter needed).
- Rendering: reuse the `RedemptionHistoryRow` molecule from the
  /project Redeem tab — identical card per row.
- Filters: token dropdown (built from distinct `token_symbol` across
  the response) and status dropdown (pending / processing / shipped /
  fulfilled / cancelled).
- Empty state: "No redemptions yet. Start one from the **Holdings**
  page or any project's Redeem tab."

### 3. Backend: `HoldingResponse` carries redemption fields

`apps/api/schemas/portfolio.py` `HoldingResponse` gains:

- `redemption_manager_address: str | None`
- `redemption_type: str | None`

`apps/api/api/v1/endpoints/portfolio.py` `_holding_to_response`
populates both from the eager-loaded token relationship. Required
because the Redeem button needs the RM address to open the modal — and
we don't want to round-trip per row to fetch it.

### 4. `DashboardLayout.ACCOUNT_LINKS` adds a Redemptions entry

Slot between Vesting and Transfer:

```ts
{ href: "/portfolio/redemptions", label: "Redemptions", icon: PackageOpen }
```

`PackageOpen` from lucide-react (matches the existing aesthetic — Bell,
Wallet, Shield, MapPin are all from lucide).

## Out of scope

- Adding a Redeem button to the per-project transactions list (rows
  there are sale-wide tx history, not user-scoped balances).
- Issuer-side dashboard for cross-token redemptions (covered by the
  existing `/issuer/redemptions` and `/platform/redemptions` pages).
- Email notification when a redemption is fulfilled (separate
  notification work — covered by today's `notify_redemption_fulfilled`).
- Soft-delete on cancelled rows (still listed; users see history).
