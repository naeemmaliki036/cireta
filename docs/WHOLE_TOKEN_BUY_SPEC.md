# Whole-Token Buy — Design Spec

**Date:** 2026-04-11
**Status:** Design — awaiting approval before implementation

---

## Problem

The current buy formula uses USDC amount as input and calculates token allocation:
```
tokensToAllocate = (usdcAmount * 10^tokenDecimals) / pricePerToken
```

This causes:
- Rounding dust (investor overpays, gets fewer tokens)
- Fractional token allocations (e.g. 1.176470 tokens)
- Dirty accounting across vesting, claims, and supply tracking
- Confusing UX — investor thinks in dollars, not in asset units

## Solution

Flip the input: investor specifies **whole token quantity**, contract calculates exact USDC.

```
usdcRequired = tokenQty * pricePerToken
```

Where `tokenQty` is always a whole number (1, 2, 100 — never 1.5).

**Zero rounding. Zero dust. Clean allocations.**

---

## The Math

### Current (USDC → tokens, lossy)
```
Input:  5000 USDC at $1/token (6-dec)
Calc:   (5_000_000_000 * 1_000_000) / 1_000_000 = 5_000_000_000
Output: 5,000.000000 tokens ← happens to be exact at $1, but not at $85k
```

### New (tokens → USDC, exact)
```
Input:  5000 tokens at $1/token
Calc:   5000 * 1_000_000 = 5_000_000_000 USDC raw = $5,000
Output: Exactly 5,000 tokens, exactly $5,000 USDC. Always.
```

### Wassa Gold Example ($85,000/kg, 2882 kg total)

`pricePerToken = 85_000 * 1e6 = 85_000_000_000` (USDC raw for 1 token)

| Action | tokenQty | USDC Required | Tokens Received |
|---|---|---|---|
| Buy 1 kg | 1 | $85,000 | 1.000000 |
| Buy 100 kg | 100 | $8,500,000 | 100.000000 |
| Buy last 2 kg | 2 | $170,000 | 2.000000 |

No rounding. No dust. No phantom value.

---

## Contract Changes

### `buy()` signature change

```solidity
// OLD: buy(uint256 phaseId, uint256 amount)    ← amount = USDC raw
// NEW: buy(uint256 phaseId, uint256 tokenQty)  ← tokenQty = whole tokens (1, 2, 100)

function buy(uint256 phaseId, uint256 tokenQty) external nonReentrant onlyStatus(SaleStatus.Active) {
    Phase storage phase = _checkBuyEligibility(phaseId);

    // Enforce whole tokens only
    if (tokenQty == 0) revert AmountTooSmall();

    // Calculate exact USDC required (no rounding)
    uint256 usdcRequired = tokenQty * phase.pricePerToken;

    // Convert to raw token units for internal accounting
    uint256 tokensRaw = tokenQty * (10 ** tokenDecimals);

    // Min/topup checks (now in token units)
    _checkMinTokens(phase, tokenQty);
    _checkAllocationAndSupply(phase, tokensRaw);

    // Hard cap check on USDC side
    if (totalRaised + usdcRequired > hardCap) revert ExceedsHardCap();

    // Max per investor (now in token units)
    uint256 investorTokens = contributions[msg.sender].tokensAllocated / (10 ** tokenDecimals);
    if (phase.maxTokens > 0 && investorTokens + tokenQty > phase.maxTokens)
        revert ExceedsMaxContribution();

    // Block limit (still in USDC for anti-flash-loan)
    if (_blockContributions[block.number] + usdcRequired > maxPerBlock) revert ExceedsBlockLimit();

    // Effects
    phase.sold += tokensRaw;
    totalRaised += usdcRequired;
    totalTokenSold += tokensRaw;
    totalContributed[msg.sender] += usdcRequired;
    paymentContributed[msg.sender] += usdcRequired;
    paymentContributedTotal += usdcRequired;
    _blockContributions[block.number] += usdcRequired;
    contributions[msg.sender].amount += usdcRequired;
    contributions[msg.sender].tokensAllocated += tokensRaw;

    // Pull USDC
    paymentToken.safeTransferFrom(msg.sender, address(this), usdcRequired);

    // Distribute tokens or fractions
    if (saleMode == SaleMode.Direct) {
        IERC20(token).safeTransfer(msg.sender, tokensRaw);
        contributions[msg.sender].claimed = true;
    } else {
        fractionToken.mint(msg.sender, FRACTION_ID_USDC, tokensRaw, "");
        vault.recordAllocation(msg.sender, FRACTION_ID_USDC, tokensRaw);
    }

    // Defer-finalize
    if (totalRaised >= hardCap || totalTokenSold >= totalTokenSupply) {
        if (!finalizationPending) {
            finalizationPending = true;
            emit FinalizationPending(totalRaised, totalTokenSold);
        }
    }

    emit Purchase(msg.sender, phaseId, usdcRequired, tokensRaw, false);
}
```

### Phase struct changes

```solidity
struct Phase {
    string name;
    uint256 pricePerToken;      // USDC raw for 1 whole token
    uint256 allocation;         // raw token units (unchanged)
    uint256 sold;               // raw token units (unchanged)
    uint256 minTokens;          // RENAMED: whole tokens (was minContribution in USDC)
    uint256 maxTokens;          // RENAMED: whole tokens (was maxContribution in USDC, 0 = unlimited)
    uint256 topUpMinTokens;     // RENAMED: whole tokens (was topUpMin in USDC)
    uint256 startTime;
    uint256 endTime;
    bool whitelistOnly;
    AllocationMode allocationMode;
}
```

### Min/topup check (now in tokens)

```solidity
function _checkMinTokens(Phase storage phase, uint256 tokenQty) internal view {
    uint256 investorTokens = contributions[msg.sender].tokensAllocated / (10 ** tokenDecimals);

    if (investorTokens == 0) {
        // First-time buyer
        if (tokenQty < phase.minTokens) {
            // Last-chunk exception
            uint256 remainingTokens = (totalTokenSupply - totalTokenSold) / (10 ** tokenDecimals);
            if (tokenQty != remainingTokens) revert BelowMinContribution();
        }
    } else {
        // Repeat buyer (top-up)
        if (tokenQty < phase.topUpMinTokens) {
            // Last-chunk exception for top-ups too
            uint256 remainingTokens = (totalTokenSupply - totalTokenSold) / (10 ** tokenDecimals);
            if (tokenQty != remainingTokens) revert TopUpBelowMin();
        }
    }
}
```

### `buyOTC()` — same pattern

```solidity
function buyOTC(uint256 phaseId, uint256 tokenQty) external ...
```

Same logic, but pulls OTC tokens instead of USDC:
```solidity
uint256 otcRequired = tokenQty * phase.pricePerToken;  // OTC token has same decimals convention
```

### `addPhase()` — updated params

```solidity
function addPhase(
    string calldata name,
    uint256 pricePerToken,     // USDC raw for 1 whole token
    uint256 allocation,        // raw token units
    uint256 minTokens,         // whole tokens (was minContribution)
    uint256 maxTokens,         // whole tokens (was maxContribution)
    uint256 topUpMinTokens,    // whole tokens (was topUpMin)
    uint256 startTime,
    uint256 endTime,
    bool whitelistOnly,
    AllocationMode allocationMode
) external onlyIssuer { ... }
```

Validation changes:
- `minTokens > 0` (replaces `minContribution > 0`)
- `maxTokens == 0 || maxTokens >= minTokens` (replaces contribution range check)
- **Remove `TOP_UP_MIN_FLOOR`** — the $1000 USDC floor doesn't apply when
  we're specifying tokens. The floor is implicit in the token price.
  (1 token at $85k > $1000 automatically)
- `topUpMinTokens > 0`

---

## Wassa Gold — Full Phase Config

2882 kg of gold → 2882 tokens, 6 decimals each.

| Phase | pricePerToken | minTokens | topUpMinTokens | maxTokens | allocation |
|---|---|---|---|---|---|
| Seed | 85_000_000_000 ($85k) | 100 | 10 | 0 (unlimited) | 1000 tokens |
| Private | 85_000_000_000 ($85k) | 50 | 5 | 0 | 1000 tokens |
| Retail | 85_000_000_000 ($85k) | 10 | 1 | 0 | 882 tokens |

### Last-Chunk Scenario

2880 tokens sold, 2 remaining. A buyer enters `tokenQty = 2`:
- `minTokens = 10` → fails normal check
- Last-chunk exception: `remainingTokens = 2`, `tokenQty == 2` → **allowed**
- Buyer pays `2 * $85,000 = $170,000` USDC
- Gets exactly 2 tokens. Sale is now 100% sold.

### Cross-Phase Top-Up

Investor bought 100 tokens in Seed. Private round opens with `minTokens = 50`,
`topUpMinTokens = 5`. Since the investor already has tokens
(`investorTokens > 0`), they skip the `minTokens` check and can top up with
as few as 5 tokens ($425,000).

---

## Last-Chunk Behavior Options

When remaining supply < minTokens, two options:

### Option A: Open to anyone (recommended)
Any verified investor can buy exactly the remaining quantity, regardless of min.
Simple, fair, no special handling needed beyond the exception check.

### Option B: OTC-only for remainder
If OTC is enabled, restrict last-chunk buys to OTC flow only. This gives the
issuer control over who gets the tail allocation.

**Recommendation:** Option A. The last chunk is a small position (< minTokens,
often < 10 tokens). Restricting to OTC adds complexity with no clear benefit.
The issuer already controls via whitelist if needed. The last-chunk exception
is clean enough — `tokenQty must == remainingTokens`, so it's always an exact
fill, never partial.

---

## UI Changes

### Invest Page (`apps/launchpad/src/app/invest/[slug]/page.tsx`)

**Current:** Amount input in USDC → "You'll receive ~X tokens"
**New:** Token quantity input (whole numbers only) → "Total cost: $X USDC"

```
┌─────────────────────────────────────────────┐
│  How many tokens would you like to buy?     │
│                                             │
│  ┌─────────────┐                            │
│  │     100     │  WGOLD tokens              │
│  └─────────────┘                            │
│                                             │
│  Price per token:    $85,000 USDC           │
│  Total cost:         $8,500,000 USDC        │
│  Your balance:       $10,000,000 USDC       │
│                                             │
│  Min purchase: 100 tokens (Seed Round)      │
│  Max purchase: Unlimited                    │
│                                             │
│  [ Continue ]                               │
└─────────────────────────────────────────────┘
```

Input validation:
- Integer only (no decimals)
- `>= minTokens` (or `>= topUpMinTokens` for repeat buyers)
- `<= maxTokens` (if set)
- `<= remaining supply`
- USDC balance sufficient for `tokenQty * pricePerToken`

### Admin Phase Form

Change labels:
- "Min Contribution ($)" → "Min Tokens (whole)"
- "Max Contribution ($)" → "Max Tokens (whole, 0 = unlimited)"
- "Top-Up Min ($)" → "Top-Up Min Tokens (whole)"

---

## Backend Changes

### Schema (`apps/api/schemas/sale.py`)

```python
class SalePhaseCreate(BaseModel):
    min_tokens: int = Field(..., gt=0)        # was min_contribution
    max_tokens: int = Field(default=0, ge=0)  # was max_contribution
    top_up_min_tokens: int = Field(..., gt=0)  # was top_up_min
```

### DB Model (`apps/api/models/sale_phase.py`)

Rename columns:
- `min_contribution` → `min_tokens`
- `max_contribution` → `max_tokens`
- `top_up_min` → `top_up_min_tokens`

### Alembic Migration

Rename columns (preserves data, just different semantics).

---

## What Doesn't Change

- `pricePerToken` — still in USDC raw units for 1 whole token
- `allocation` — still in raw token units
- `sold` — still in raw token units
- `totalTokenSupply` — still in raw token units
- `totalRaised` — still in USDC raw units
- `hardCap` / `softCap` — still in USDC raw units
- Vesting math — unchanged (operates on raw token units)
- Claim flow — unchanged
- Refund flow — unchanged (refunds exact USDC paid)
- Fee calculation — unchanged (percentage of USDC)

---

## Breaking Changes

1. `buy(phaseId, amount)` → `buy(phaseId, tokenQty)` — second param meaning changes
2. `buyOTC(phaseId, amount)` → `buyOTC(phaseId, tokenQty)` — same
3. `addPhase()` params: `minContribution, maxContribution, topUpMin` →
   `minTokens, maxTokens, topUpMinTokens`
4. Phase struct fields renamed
5. `Purchase` event: `amount` field now represents USDC (calculated), not user input
6. Frontend invest page: input changes from USDC to token quantity

All existing test sales must be redeployed (fresh deploy covers this).

---

## Implementation Order

1. Contract changes (Sale.sol — buy, buyOTC, addPhase, Phase struct)
2. Update hardhat tests
3. Backend schema + migration
4. Admin UI (phase form labels)
5. Launchpad invest page (token quantity input)
6. ABI updates (admin + launchpad)
7. E2E test on local hardhat
