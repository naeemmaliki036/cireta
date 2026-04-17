# Last-Chunk Exception — Backend Gap Analysis & Fix

## Problem

When a sale phase has fewer remaining tokens than the minimum buy requirement,
the on-chain contract allows buying exactly the remaining amount (the "last-chunk
exception"). The backend API does not implement this exception, creating a
mismatch that causes ghost purchases.

### Example

- Phase: 103 tokens, `minTokens = 10`, `topUpMinTokens = 5`
- 100 tokens sold → 3 remaining
- New buyer wants to buy the last 3 tokens
- **Contract:** allows it (last-chunk exception in `_checkMinTokens`)
- **Backend:** rejects with `BELOW_MINIMUM` (flat `min_contribution` check)
- **UI:** shows success (catches backend error silently), but the purchase
  never appears in the investor's portfolio or transaction history

## Contract Logic (Source of Truth)

`contracts/src/sale/Sale.sol:712-745` — `_checkMinTokens()`:

1. Computes `remainingWholeTokens = (totalTokenSupply - totalTokenSold) / 10**decimals`
2. Determines `effectiveMin`:
   - First-time buyer (`investorWholeTokens == 0`): uses `phase.minTokens`
   - Repeat buyer: uses `phase.topUpMinTokens`
3. If `tokenQty >= effectiveMin` → normal buy, no exception needed
4. If below minimum, checks two last-chunk exceptions:
   - **Case 1:** `tokenQty == remainingWholeTokens` → buying exactly all remaining → allowed
   - **Case 2:** Hard-cap-constrained — `remainingWholeTokens < effectiveMin` and buyer
     purchases exactly `maxAffordable = remainingUsdc / pricePerToken` → allowed
5. If neither exception matches → reverts `BelowMinContribution` or `TopUpBelowMin`

Last-chunk buys also relax the hard cap check (small overshoot allowed so tokens
don't get permanently stuck).

## UI State (Already Correct)

`apps/launchpad/src/components/organisms/BuyFlow.tsx:131-142`:
- `buildQuickQuantities()` shows only the remaining amount when `availableTokens < effectiveMin`

`BuyFlow.tsx:202-214`:
- Client-side validation allows `tokenQty == effectiveMax` when `effectiveMax < effectiveMin`

`apps/launchpad/src/app/buy/[slug]/page.tsx:381-399`:
- On-chain tx fires first, backend recording fires second
- Backend errors are caught silently — success screen shows regardless

## Backend Gap (Fixed)

`apps/api/services/sale_contribute_service.py:223-231`:

**Before (broken):**
```python
if active_phase.min_contribution > 0 and contrib_amount < active_phase.min_contribution:
    raise BELOW_MINIMUM
```
No remaining-supply check. No first-time vs repeat buyer differentiation.
No last-chunk exception.

**After (fixed):**
1. Computes `remaining_tokens` from `sale.total_token_supply` and sum of
   `tokens_allocated` across all confirmed contributions
2. Determines `effective_min` based on whether the buyer already has contributions
   (first-time → `min_contribution`, repeat → `top_up_min`)
3. If `contrib_amount < effective_min`, checks last-chunk exception:
   buying exactly the remaining tokens (in USDC terms) is allowed
4. Hard cap relaxation for last-chunk buys mirrors the contract

## Test Coverage

- `contracts/test/E2E_LastChunk.test.ts` — 8 cases covering all on-chain scenarios
- `tests/unit/test_sale_service.py` — new tests for backend last-chunk exception:
  - Last-chunk buy below min by new investor → allowed
  - Last-chunk top-up below topUpMin by repeat investor → allowed
  - Non-last-chunk below min → still rejected (`BELOW_MINIMUM`)
  - Repeat buyer below topUpMin when not last chunk → still rejected

## Files Modified

- `apps/api/services/sale_contribute_service.py` — last-chunk + top-up min logic
- `tests/unit/test_sale_service.py` — new test cases
- `docs/LAST_CHUNK_EXCEPTION.md` — this document
