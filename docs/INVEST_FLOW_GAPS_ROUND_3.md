# Invest Flow — Gap Analysis (Round 3)

Continuation of [`INVEST_FLOW_UX_GAPS.md`](./INVEST_FLOW_UX_GAPS.md).
This round catalogues data-correctness bugs and IA gaps discovered after
the round-2 fixes were live. Companion doc:
[`BUY_FLOW_USDC_AND_OTC.md`](./BUY_FLOW_USDC_AND_OTC.md).

Reviewed: 2026-04-10 against commit `ec332a6` on `staging`.

> **Status:** #1, #3, #4, #5, #12, #17 (Settings sidebar restore) **fixed**
> in the follow-up commit. The remaining items are tracked here with their
> severity, root cause, and recommended fix path.

---

## Critical (data correctness)

### 1. Contributions attributed to the **wrong** DB phase
**Severity:** High — silent data corruption.

**Where:** `apps/api/services/sale_contribute_service.py:contribute()`.

**Symptom:** When the API records a contribution from an on-chain `Purchase`
event, it looks up the active phase **at the moment of API call** using a
time-based DB query and writes that `phase_id`. The contract emits the
real `phaseId` (uint256) inside the event but the service ignores it.

**Why it matters:** If the user calls `buy(0, ...)` against on-chain phase
**0** (Seed) but at the time of the API record the DB shows phase **1**
(Private) as time-active (because phase windows overlap, or because of
clock skew), the contribution row is written with `phase_id = Private`.
The aggregated `tokens_sold` per phase is therefore wrong, and any
downstream logic that filters by phase_id (refund flow, vesting, claims)
operates on stale attribution.

**Fix shipped:**
- `Web3SaleService.record_on_chain_contribution` already returns
  `phase_id` from the event (the on-chain uint256 index).
- `SaleContributeService.contribute` now uses that index. The DB phase is
  resolved by sorting `sale.phases` by `start_time` and picking the entry
  at that index. This matches the contract's `addPhase` ordering, which
  is stable.
- Added a guard: if `on_chain_phase_index >= len(phases)`, the service
  raises `400 INVALID_PHASE_INDEX` rather than silently writing the wrong
  row.

**Follow-up tracked:** add an `on_chain_phase_index` column to
`sale_phases` so the lookup doesn't depend on sort order. Until then the
sort-by-`start_time` approach is correct because the contract enforces
strictly-increasing phase windows in `addPhase`.

### 5. DB `min_contribution` is out of sync with on-chain
**Severity:** High — UI shows wrong values.

**Where:** `sale_phases.min_contribution` and `sale_phases.max_contribution`
in the DB vs. `Sale.getPhase(i)` on-chain.

**Symptom:** Wassa Gold's Seed phase shows `Min Buy: $0` in the UI, but
the on-chain `phase.minContribution = 2,882_000000` (i.e. $2,882). An
investor enters $1,000, sees no validation error, clicks Continue, and
gets `BelowMinContribution` revert from MetaMask. Same drift can apply
to `max_contribution`, `start_time`, `end_time`.

**Root cause:** When an issuer edits a phase via the admin UI, the change
writes to the DB but does **not** push the new value on-chain (and vice
versa). The two diverge silently.

**Fix shipped:**
- Read on-chain phases via `Sale.getPhase(i)` and update the DB rows.
- Run against dev + staging for the Wassa sale to bring DB in sync with
  the deployed contract.

> **Correction (2026-04-10):** the first attempt of this sync used a
> wrong ABI ordering (swapped `allocation, sold` with `minContribution,
> maxContribution`) and wrote garbage values into the DB
> (`Phase 1 Seed → max $1,177.65` etc.). The actual Solidity struct
> order is `name, pricePerToken, allocation, sold, minContribution,
> maxContribution, startTime, endTime, whitelistOnly`. Fixed and re-synced.
> The on-chain truth for the Wassa sale is:
> - Phase 1 Seed: min `$0`, max `$0` (no per-investor caps)
> - Phase 2 Seed Round: min `$85,000`, max `$50,000,000`
> - Phase 3 Retail: min `$50,000`, max `$50,000,000`

**Follow-up tracked:** add an event listener that subscribes to
`Sale.PhaseAdded` / `Sale.PhaseUpdated` (if those events exist) and
auto-syncs the DB. Or, in the admin UI, when an issuer edits a phase,
proxy the write through the contract first. Or, simplest: lock DB phase
edits after sale activation and only allow on-chain updates.

### 12. DB `phase_number` duplicates
**Severity:** Medium — display already fixed in round 2, but other code
paths still read the column.

**Symptom:** The Wassa sale has `phase_number = 1, 1, 2` in the DB
(Seed=1, Private=1, Retail=2). The retail phase commit (`f09f7d0`) added a
phase but didn't reset the existing numbering. Round-2 frontend fix
ignores the column and displays by `start_time` index, but anything else
that reads `phase_number` (admin UI, subgraph indexing) still sees
duplicates.

**Fix shipped:**
- DB UPDATE on dev + staging to renumber by `start_time` order
  (Seed=1, Private=2, Retail=3).
- Backend `_sale_to_response` already sorts by `start_time`, so the
  serialized order matches the renumbered values.

**Follow-up tracked:** add a `UNIQUE(sale_id, phase_number)` constraint
via Alembic migration so this can't happen again. Also a Pydantic
validator on `PhaseCreateRequest` to compute `phase_number` from existing
phases instead of letting the caller set it.

## Critical (UX)

### 2. Off-chain OTC contributions skew per-phase totals
**Severity:** Medium — numbers don't lie but they don't add up either.

**Where:** `_phase_sold_map` in `apps/api/api/v1/endpoints/sales.py`.

**Symptom:** The 10M off-platform OTC contribution has `amount=0,
tokens_allocated=10_000_000`. The aggregator sums both blindly, so the
Seed phase shows `tokens_sold=10_000_001` but `usdc_raised=$100M`
(excludes the off-chain). The frontend bar mixes two units when it
displays a tier as "X raised" plus separately a token count.

**Why we left it:** Off-chain OTC IS a real allocation the issuer made
out-of-band — those tokens are committed. Filtering them out would
under-count. Including them in `tokens_sold` and excluding from
`usdc_raised` is the truthful summary, but cosmetically misleading.

**Recommended fix:** add `tokens_sold_otc_offchain` as a separate field
on `SalePhaseResponse`, return both, and have the frontend render them
as two adjacent numbers ("10,000,001 sold, of which 10,000,000 off-platform").

## High (visibility)

### 3. Soft cap is invisible in the UI
**Severity:** Medium — investors can't tell whether the sale will refund.

**Where:** `sale.soft_cap` is in the DB and on the API response, but the
UI doesn't surface it anywhere on the project page.

**Fix shipped:** Token & Sale tab summary card now shows
`Soft Cap: $X` alongside Hard Cap and Total Raised. If `total_raised <
soft_cap`, an additional row appears: "Refundable until soft cap is
reached." If the sale finalizes below the soft cap, contributors are
entitled to a refund — the UI now communicates that condition.

### 4. No global progress bar on the Token & Sale tab
**Severity:** Medium.

**Symptom:** After round 2, per-phase bars show "X raised in this tier"
(for `price_tiered`) but there's no single bar showing
`total_raised / hard_cap` on the Token & Sale tab. The main banner widget
has it, but if you scroll past the banner you lose the global context.

**Fix shipped:** new "Sale Progress" card at the top of the Token & Sale
tab showing `total_raised / hard_cap` with a progress bar, plus the
`soft_cap` markline if `soft_cap > 0`.

## Medium (config / IA)

### 6. Identical prices across phases — UX implies tiers when there are none
The Wassa sale has `$85,000/token` in all 3 phases. The "Phases" name
suggests tiered pricing, but it's just three time windows at the same
price. The UI should detect this and either (a) collapse into a single
"Sale window" view, or (b) re-label phases as "time windows".

**Recommendation:** detect identical prices and add a banner: "All phases
use the same price — these are time windows, not pricing tiers."

### 7. Phase windows stretching across many months
Wassa Gold's "Retail" phase ends 2026-06-09 — 5 months out. Combined
with #6, that's "3 time-windows, same price" which doesn't really need 3
phases. The admin UI should warn the issuer at sale creation if phases
have identical config.

### 13. "Token & Sale" tab name is misleading
The tab contains: token info, sale phases, vault address, identity
registry. It's really "Sale Details". Documents are in a separate tab
even though some sale-related docs (whitepaper, prospectus) live there.
Minor IA tightening — rename and consolidate.

### 15. Subscribe button has no copy
The project page hero has a Subscribe button with no copy explaining
what the user will receive. Add: "Get notified when the next phase
opens, when soft cap is reached, and when the token is claimable."

### 16. Empty state for "0 sales available"
Sales index probably renders an empty grid if no public sales exist.
Add a placeholder: "No sales open right now. Subscribe to be notified
when the next sale opens."

## Low / out of scope

### 8. Referral attribution
Not a bug — opportunity. Add a `discovered_via` field on register / first
buy, free-text or dropdown ("twitter", "friend", "google", "other").

### 9. Mid-flow link to "your transactions for this project"
On the invest page amount step, after round 2 the UI shows
"You've contributed $X / $Y max". A direct link to the project's
Transactions tab would close the loop.

### 10. No admin UI to mint OTC vouchers
Already tracked in [`BUY_FLOW_USDC_AND_OTC.md`](./BUY_FLOW_USDC_AND_OTC.md)
known gaps. Issuers currently have to call `IssuerOTCToken.mint` from a
script. Needs a dedicated page in `apps/admin`.

### 11. Sale contract whitelisting on OTC identity registry — not automated
Already tracked in [`BUY_FLOW_USDC_AND_OTC.md`](./BUY_FLOW_USDC_AND_OTC.md)
known gaps. Belongs in the sale-deploy pipeline, not runtime.

### 14. Mobile sidebar doesn't exist
`hidden lg:flex` on `DashboardLayout` sidebar — below 1024px the user has
zero sidebar nav. Needs a hamburger / drawer pattern for the entire
investor section.

### 18. `min_contribution = 0` allowed at every layer
**Severity:** High — config mistake silently breaks the buyer floor.

**Symptom:** The Wassa sale's Phase 1 (Seed) was created on-chain with
`minContribution = 0`. This disables the first-time-buyer floor entirely
(`if (totalContributed[msg.sender] == 0 && amount < phase.minContribution)
revert BelowMinContribution();` — a comparison against 0 that always passes).
Anyone can buy any amount in that phase, even $0.000001. The DB also
allowed it, the admin form allowed it, and there's no `updatePhase`
function to fix it after the fact.

**Root cause:** None of the four layers validated `min > 0`:
1. **Contract `Sale.addPhase`** — accepts any uint256 including 0
2. **Pydantic `SalePhaseCreate`** — `min_contribution: Decimal = Field(default=Decimal("0"))`
3. **Endpoint `PhaseCreateRequest`** — `min_contribution: str = "0"`
4. **Admin `AddPhaseForm.tsx`** — defaulted to `BigInt(0)` when blank

**Fix shipped:**
- **Contract:** new `error ZeroMinContribution()` (selector `0xbf48e85d`)
  and `if (minContribution == 0) revert ZeroMinContribution();` in
  `Sale.addPhase`. Sale.sol is UUPS-upgradeable so the existing Wassa sale
  can pick up this validation via an upgrade. Existing wrong phases (like
  Wassa's Phase 1 on-chain) are NOT fixed because the contract has no
  `updatePhase` function — the workaround is to (a) add a new phase with
  the right config, then (b) ensure the broken phase's time window has
  passed before activation.
- **Pydantic:** `min_contribution: Decimal = Field(..., gt=0)` — required
  and must parse to a positive Decimal. Inherits the same validator
  semantics as the existing `min < max` check.
- **Endpoint:** removed the `"0"` default; endpoint now raises
  `400 ZERO_MIN_CONTRIBUTION` if the value parses to ≤ 0.
- **Admin form:** required field, validation message
  "Min contribution is required and must be greater than 0. Use $1 for a
  low floor.". Label gains `*` and "must be > 0" hint, `required` HTML
  attribute set.
- **Launchpad:** added the `0xbf48e85d` selector to
  `revertReasons.ts` so any caller hitting the contract revert sees a
  friendly message instead of the raw selector.

**Follow-up tracked:** consider also requiring `max_contribution > 0` if
the issuer's intent is to cap individual investors. Currently `max = 0`
means "unlimited" which is intentional and stays optional.

> **Existing wrong data on Base Sepolia:** Wassa Sale phase 0 still has
> `minContribution = 0` on-chain. There is no on-chain fix without a
> contract redeploy. Document this and live with it for the test sale,
> or roll a fresh test sale with the new validation in place.

### 17. Settings sidebar restored after over-zealous dedup
Round-2 fix removed the `SETTINGS_LINKS` block in `DashboardLayout`
because /account had inline tabs that mirrored /settings/*. After /account
was reduced to navigation cards, the Settings sidebar section was needed
again — without it, users navigating into /settings/profile lost all
sidebar context. **Fixed** in commit `ec332a6` by restoring the section.
The original duplication concern doesn't apply because /account no
longer has inline tabs.

---

## Implementation status

| # | Gap | Severity | Status | Files |
| --- | --- | --- | --- | --- |
| 1 | Wrong phase attribution | High | ✅ Fixed | `sale_contribute_service.py` |
| 2 | Off-chain OTC skews per-phase totals | Medium | ⏳ Documented | (no code change yet) |
| 3 | Soft cap invisible | Medium | ✅ Fixed | `project/[slug]/page.tsx` |
| 4 | No global progress bar | Medium | ✅ Fixed | `project/[slug]/page.tsx` |
| 5 | DB / on-chain drift | High | ✅ Fixed (one-shot) | `scripts/sync_phases_from_chain.py` + DB sync |
| 6 | Identical prices look like tiers | Low | ⏳ Tracked | issuer admin UI |
| 7 | Long single-tier phases | Low | ⏳ Tracked | issuer admin UI |
| 8 | Referral attribution | Low | ⏳ Tracked | future feature |
| 9 | Mid-flow link to project txs | Low | ⏳ Tracked | invest page |
| 10 | Admin OTC mint UI | High (issuer) | ⏳ Tracked | new admin page needed |
| 11 | Sale whitelist automation | High (deploy) | ⏳ Tracked | deploy script |
| 12 | DB phase_number duplicates | Medium | ✅ Fixed (one-shot) | DB UPDATE + Alembic follow-up tracked |
| 13 | Tab naming | Low | ⏳ Tracked | rename pass |
| 14 | Mobile sidebar | Medium | ⏳ Tracked | new responsive nav |
| 15 | Subscribe button copy | Low | ⏳ Tracked | copy update |
| 16 | Empty sales state | Low | ⏳ Tracked | placeholder add |
| 17 | Settings sidebar restored | — | ✅ Fixed | `DashboardLayout.tsx` |
| 18 | `min_contribution = 0` allowed at every layer | High | ✅ Fixed (4 layers) | `Sale.sol` + `schemas/sale.py` + `endpoints/sales.py` + `AddPhaseForm.tsx` + `revertReasons.ts` |
