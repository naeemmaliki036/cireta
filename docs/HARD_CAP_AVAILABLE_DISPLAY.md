# Hard-Cap-Constrained Available Token Display

## Problem

The UI shows raw remaining supply (allocation - sold) as "Available" tokens,
but this ignores the hard cap constraint. When the remaining token supply at
the current phase price would exceed the hard cap, the actual purchasable
amount is lower than what's displayed.

### Example (WGGH Sale)

| Field | Value |
|---|---|
| Total supply | 2,882 WGGH |
| Hard cap | $244,970,000 |
| Seed price | $85,000/token |
| Private price | $115,000/token |
| Seed sold | ~2,521 tokens ($214,285,000) |
| Remaining supply | 361 tokens |

**UI shows:** 361 WGGH available
**Reality:** floor(($244,970,000 - $214,285,000) / $115,000) = ~266 tokens

The extra ~95 tokens cannot be sold — the contract reverts `ExceedsHardCap`.
Investors see 361 available, try to buy 300, and the tx reverts.

## Root Cause

Two places display "available" without hard-cap capping:

1. **Project page phase card** — shows `allocation` or "Remaining supply" label
   with no hard-cap constraint applied

2. **Buy page** — the `InvestAmountStep` already computes `hardCapMaxTokens`
   and uses it for validation, but the `phaseRemainingTokens` passed from the
   parent buy page is raw (allocation - sold) without hard-cap capping. The
   "Available: X WGGH" label uses `availableTokens` which prefers
   `phaseRemainingTokens` over the hard-cap-constrained value.

## Fix

### Buy page (`apps/launchpad/src/app/buy/[slug]/page.tsx`)

Cap `phaseRemainingTokens` to the hard-cap-constrained max before passing it
to `InvestAmountStep`:

```
effectiveAvailable = min(phaseRemainingTokens, floor((hardCap - totalRaised) / price))
```

This flows through to:
- Quick-buy buttons (capped to effective available)
- "Available: X" label
- Validation error messages
- Last-chunk exception detection

### Project page phase card (`apps/launchpad/src/app/project/[slug]/page.tsx`)

Show the effective available (hard-cap-constrained) instead of raw allocation
for Remaining-mode phases. Requires reading `hardCap` and `totalRaised` from
on-chain (already available via the sale contract reads on the buy page).

## Files Modified

- `apps/launchpad/src/app/buy/[slug]/page.tsx` — cap phaseRemainingTokens
- `apps/launchpad/src/app/project/[slug]/page.tsx` — show effective available in phase card
