# Cireta Sale System — Deep Dive + Gap Analysis

A comprehensive technical reference for the entire sale stack, mapped against
the business requirements provided. Companion to:
- [`CONTRACT_VALIDATION_AUDIT.md`](./CONTRACT_VALIDATION_AUDIT.md) — pure
  contract validation checklist
- [`BUY_FLOW_USDC_AND_OTC.md`](./BUY_FLOW_USDC_AND_OTC.md) — UI buy flows
- [`FRESH_DEPLOY_PLAN.md`](./FRESH_DEPLOY_PLAN.md) — fresh redeploy runbook

Reviewed: 2026-04-10 against commit `97caa41` on `staging`
(round 4 deployed: Sale impl `0xD33f9b09…`, OTC impl `0x928884Aa…`).

---

## Part 1 — How it works today

### 1.1 Contracts in the sale stack

| Contract | Role |
| --- | --- |
| `Sale.sol` | Main sale contract. Holds phases, contributions, status, USDC. UUPS upgradeable. One per sale. |
| `CiretaVault.sol` | Vesting vault for vested-mode sales. Holds project tokens, releases them on a cliff+linear schedule. UUPS upgradeable. One per vested sale. |
| `CiretaFractionToken.sol` | ERC-20 fraction representing a vesting position. Minted on buy, burned on claim/refund. Identity-gated transfers. UUPS upgradeable. One per vested sale. |
| `IssuerOTCToken.sol` | Per-issuer ERC-20 voucher for off-platform allocations. 6 decimals (USDC-pegged). Burned by `Sale.buyOTC`. UUPS upgradeable. One per issuer (or per sale). |
| `CiretaSaleFactory.sol` | Deploys `Sale` proxies. Holds `saleImplementation` pointer. Owned by admin. |
| `CiretaFractionFactory.sol` | Deploys vault + fraction proxies for vested sales. Holds vault and fraction impl pointers. Owned by `CiretaSaleFactory` (no pass-through setters). |
| `IssuerOTCTokenFactory.sol` | Deploys OTC token proxies for issuers. |
| `SimpleIdentityRegistry.sol` | KYC whitelist. Wallets verified by REGISTRAR_ROLE. |

### 1.2 Sale lifecycle

`SaleStatus` enum: `Draft → Active → Paused → FinalizedSuccess` / `FinalizedFailed`,
with `Rejected` as a permanent dead end from Draft.

| From | To | Function | Caller | Notes |
| --- | --- | --- | --- | --- |
| `Draft` | `Active` | `activate()` | Admin | Requires tokens deposited; ≥ 1 phase configured |
| `Draft` | `Rejected` | `reject()` | Admin | Permanent. Issuer can still `withdrawTokens()` |
| `Active` | `Paused` | `pause()` | Issuer or Admin | |
| `Paused` | `Active` | `unpause()` | Admin only | |
| `Active`/`Paused` | `FinalizedSuccess` | `_finalize()` (success branch) | Internal | `totalRaised >= softCap` |
| `Active`/`Paused` | `FinalizedFailed` | `_finalize()` (failed branch) | Internal | `totalRaised < softCap` |

`_finalize()` is called from:
- **`finalizeSale()`** (manual, issuer or admin, in Active or Paused)
- **`buy()`** auto-trigger when `totalRaised >= hardCap` (inline during the buyer's tx)
- **`buyOTC()`** auto-trigger same condition

### 1.3 Sale modes — Direct vs Vested

`saleMode` is set via `setVestedMode(vault, fractionToken)` (admin-only, Draft). Default is `Direct`.

| | Direct | Vested |
| --- | --- | --- |
| Pre-activate | Project tokens deposited into Sale contract | Project tokens deposited into Vault |
| `buy()` token transfer | Sale → buyer instantly | Sale mints fractions to buyer + records allocation in Vault |
| Claim | `claimTokens()` (sale-side) | `vault.claim()` |
| Finalization side-effect | None beyond fee transfer | `vault.startVesting()` records `vestingStartTime = block.timestamp` |

### 1.4 Sale structures — PhaseAllocated vs PriceTiered

`saleStructure` is set via `setSaleStructure(...)` (issuer-only, Draft). Default is `PhaseAllocated`.

| | PhaseAllocated | PriceTiered |
| --- | --- | --- |
| Per-phase `allocation` field | Hard cap, enforced in `buy`/`buyOTC` (`phase.sold + tokens > allocation` reverts) | **Ignored** by the contract |
| Cumulative allocation check at `addPhase()` | Enforced (`Σ allocation ≤ hardCap`) | Not enforced |
| Global cap | Still enforced (`hardCap`) | Only enforcement |
| Real-world meaning | "Bucket per phase" — unsold rolls **off the table** at phase end | "Time tiers" — single shared pool, unsold rolls forward implicitly |

### 1.5 Phase struct + addPhase validation

```solidity
struct Phase {
    string name;
    uint256 pricePerToken;     // 1e18-scaled — tokens to allocate = (amount * 1e18) / pricePerToken
    uint256 allocation;        // PhaseAllocated only — max tokens this phase can sell
    uint256 sold;              // Tokens sold so far in this phase
    uint256 minContribution;   // Min USDC for first-time buyer in this phase
    uint256 maxContribution;   // Max cumulative USDC per investor (0 = unlimited)
    uint256 startTime;
    uint256 endTime;
    bool whitelistOnly;
}
```

`addPhase()` checks (round 4):

1. Status is `Draft` or `Active`
2. `pricePerToken > 0`
3. `minContribution > 0`
4. `maxContribution == 0 || maxContribution >= minContribution`
5. `startTime < endTime`
6. `endTime > block.timestamp`
7. `phase ⊆ [saleStartTime, saleEndTime]`
8. For PhaseAllocated: `allocation > 0` and `Σ allocation ≤ hardCap`

**Phase numbering** — assigned by array push order; the index emitted in `PhaseAdded` is `phases.length - 1`.

**No `updatePhase` / `extendPhase`** — once added, a phase is immutable. Only `phase.sold` changes (during buys).

### 1.6 Buy flow — `buy()` (USDC)

Checks (in order):
1. `phaseId < phases.length`
2. `block.timestamp >= phase.startTime`
3. `block.timestamp <= phase.endTime`
4. **First-time buyer:** `amount >= phase.minContribution` (skipped if `totalContributed[buyer] > 0`)
5. `totalContributed[buyer] + amount <= phase.maxContribution` (if max != 0)
6. `totalRaised + amount <= hardCap`
7. Per-block contribution limit (`_blockContributions[block.number] + amount <= maxPerBlock`)
8. `identityRegistry.isVerified(buyer)`
9. If phase is whitelist-only: `whitelisted[phaseId][buyer]`
10. For PhaseAllocated: `phase.sold + tokensToAllocate <= phase.allocation`

Effects:
```
phase.sold                              += tokensToAllocate
totalRaised                             += amount
totalContributed[buyer]                 += amount
_blockContributions[block.number]       += amount
contributions[buyer].amount             += amount
contributions[buyer].tokensAllocated    += tokensToAllocate
```

Interactions:
1. `paymentToken.safeTransferFrom(buyer, sale, amount)`
2. **Direct mode:** `IERC20(token).safeTransfer(buyer, tokens)` + `contributions[buyer].claimed = true`
3. **Vested mode:** `fractionToken.mint(buyer, tokens)` + `vault.recordAllocation(buyer, tokens)`
4. **Auto-finalize** if `totalRaised >= hardCap`

Token allocation: `tokensToAllocate = (amount * 1e18) / phase.pricePerToken`.

Emits `Purchase(buyer, phaseId, amount, tokens, false)` (`isOTC = false`).

### 1.7 Buy flow — `buyOTC()`

Same checks as `buy()`, plus:
- OTC token is enabled (`otcToken != address(0)`)
- Buyer holds the OTC token amount + has approved the sale to spend it
- `tokensToAllocate > 0`

Effects (delta vs `buy()`):
```
totalOtcAllocated                       += tokensToAllocate     // tracks tokens, not USDC
contributions[buyer].isOtc              = true                  // bit flag (see blind spots)
otcAllocations[buyer]                   += tokensToAllocate
```

Interactions:
1. `IERC20(otcToken).safeTransferFrom(buyer, sale, amount)` — pulls OTC tokens
2. `otcToken.burn(address(this), amount)` — **immediately burns them**
3. **Direct mode:** `IERC20(token).safeTransfer(buyer, tokens)`
4. **Vested mode:** `fractionToken.mint(buyer, tokens)` + `vault.recordAllocation(buyer, tokens)`
5. Auto-finalize same as `buy()`

Emits `Purchase(buyer, phaseId, amount, tokens, true)`.

**Critical observation:** `totalRaised += amount` runs in **both** `buy` and `buyOTC`, mixing USDC and OTC token amounts in the same counter. The hardcap check therefore treats 1 OTC token as equivalent to 1 USDC. This is "1:1 by convention" — there is no on-chain enforcement of the 1:1 peg. If an issuer mints 1,000,000 OTC tokens to a wallet, that wallet can `buyOTC` 1M units against the same hardcap as 1M USDC.

### 1.8 Per-investor accounting

```solidity
mapping(address => Contribution) public contributions;
mapping(address => uint256) public totalContributed;          // USDC + OTC, mixed units
mapping(address => uint256) public otcAllocations;            // OTC token allocations only
mapping(uint256 => mapping(address => bool)) public whitelisted;

struct Contribution {
    uint256 amount;          // USDC + OTC, mixed units (incremented in BOTH buy and buyOTC)
    uint256 tokensAllocated; // tokens received (sum across phases / methods)
    bool claimed;            // direct mode only
    bool refunded;           // refund taken
    bool isOtc;              // bit flag — flips on each contribution
}
```

**No phase-level breakdown.** The contract does not record which phase a buyer participated in, nor the price at which they bought. After 3 buys across 3 phases at 3 different prices, you can read total USDC and total tokens, but you cannot reconstruct "$5,000 at phase A's price + $3,000 at phase B's price + $2,000 at phase C's price". The original price is lost.

### 1.9 Vesting (vault + fractions)

Vault config (immutable after init): `cliffDuration`, `vestingDuration`.

Per-investor vault state:
```solidity
struct InvestorVesting {
    uint256 totalFractions;  // Sum of all allocations
    uint256 claimedAmount;   // Tokens already released
    uint256 vestingStart;    // Per-investor override (UNUSED — see blind spots)
}
```

**`recordAllocation(investor, amount)`** — called by Sale on every `buy`/`buyOTC` in vested mode. Increments `investorVesting[investor].totalFractions` and `vault.totalLocked`.

**`startVesting()`** — called by Sale in `_finalize()` success branch. Sets `finalized = true`, `vestingStartTime = block.timestamp`. Idempotent revert via `AlreadyFinalized`.

**`_calculateVested(iv)`:**
```solidity
elapsed = block.timestamp - vestingStartTime
if (elapsed < cliffDuration) return 0
if (elapsed >= vestingDuration) return iv.totalFractions
return (iv.totalFractions * elapsed) / vestingDuration
```
Linear from cliff to full at duration. **Cliff doesn't release a chunk** — it just delays the start of linear release. Cliff time counts toward the linear schedule (so at `elapsed = cliffDuration`, vested = `cliff/duration` of total).

**`claim()`:**
```solidity
require(finalized)
claimable = min(vested - claimedAmount, fractionToken.balanceOf(msg.sender))
require(claimable > 0)
investorVesting[msg.sender].claimedAmount += claimable
totalReleased += claimable
fractionToken.burnFrom(msg.sender, claimable)
projectToken.safeTransfer(msg.sender, claimable)
```

The investor receives `claimable` project tokens 1:1 against burned fractions.

**`withdrawExcess()`** — issuer only, post-finalize. Transfers `totalLocked - outstandingFractions` to issuer if any excess remains.

### 1.10 Refund flow

`Sale.claimRefund()`:
```solidity
require(status == FinalizedFailed)
require(contrib.amount > 0)
require(!contrib.refunded)
contrib.refunded = true
if (saleMode == Vested) {
    // Burn all fractions the investor still holds
    fractionToken.burnFrom(msg.sender, fractionToken.balanceOf(msg.sender))
}
paymentToken.safeTransfer(msg.sender, contrib.amount)
emit RefundClaimed(msg.sender, contrib.amount)
```

Returns the **exact USDC** the investor paid (`contrib.amount`). No partial refunds, no per-phase math, no admin gate — refund is available the moment the sale enters `FinalizedFailed`.

**Critical:** `contrib.amount` is incremented in both `buy()` and `buyOTC()`. So the refund will happily try to return USDC against an OTC contribution that was paid in burned voucher tokens. If the sale only had OTC buyers and no USDC, the refund call would still try to transfer USDC the contract doesn't have → revert. If it had a mix, OTC buyers would silently receive USDC equal to the OTC token amount they "spent" — paid out from real USDC contributors' funds. **This is a critical accounting bug.**

### 1.11 Finalization

`_finalize()` success branch:
1. Status → `FinalizedSuccess`
2. `finalizedAt = block.timestamp`
3. Compute fee: `fee = min((totalRaised * feeBasisPoints) / 10000, feeCapUsdc)`
4. `paymentToken.safeTransfer(feeManager, fee)`
5. If vested + vault holds tokens (round 4 check): `vault.startVesting()`
6. Emit `SaleFinalized(true, totalRaised, fee)`

Failed branch:
1. Status → `FinalizedFailed`
2. `finalizedAt = block.timestamp`
3. Emit `SaleFinalized(false, totalRaised, 0)`

**Auto-finalization** runs inline at the end of `buy()` / `buyOTC()` whenever `totalRaised >= hardCap`. There is no explicit "all tokens sold" trigger — the only auto-finalize condition is the USDC hardcap check.

### 1.12 Withdrawals

| Function | Caller | When | What |
| --- | --- | --- | --- |
| `withdrawFunds()` | Issuer | `FinalizedSuccess` | Entire USDC balance (post-fee) |
| `withdrawTokens()` | Issuer | `Draft` or `Rejected` | Unsold project tokens (Direct mode only — they're in the sale contract) |
| `emergencyWithdraw(recipient)` | Admin | `FinalizedSuccess` + 90 day delay | Remaining USDC (escape hatch) |

### 1.13 Storage layout

```
slot 0: token, paymentToken, identityRegistry, issuer, factory, feeManager
slot 1+: softCap, hardCap, feeBasisPoints, feeCapUsdc
slot N: saleStartTime, saleEndTime           ← round 4
slot N+: totalPhaseAllocation                 ← round 4
slot N+: totalRaised, totalOtcAllocated, platformFeeCollected
slot N+: status, phases[]
slot N+: whitelisted, contributions, totalContributed, otcAllocations
slot N+: maxPerBlock, _blockContributions
slot N+: saleMode, vault, fractionToken
slot N+: otcToken
slot N+: saleStructure
slot N+: finalizedAt
gap: uint256[43] private __gap
```

---

## Part 2 — Business requirements vs current state

Each requirement labelled with one of:

- ✅ **Implemented** — works as described
- ⚠️ **Partial** — works but has gaps
- ❌ **Missing** — not implemented at all
- 🐛 **Buggy** — implemented but incorrectly

### Sale-level

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| S1 | Sale must have a start time | ✅ | `saleStartTime` (round 4) |
| S2 | Sale must have an end time | ✅ | `saleEndTime` (round 4) |
| S3 | Sale has soft cap and hard cap | ✅ | Both validated `> 0`, `soft <= hard` |
| S4 | Total token supply decided at sale creation | ⚠️ | Token supply is implicit (whatever issuer deposits before activation). There's no explicit `totalTokenSupply` field on the Sale contract. For PhaseAllocated, `totalPhaseAllocation` sums per-phase allocations and is bounded by `hardCap` (USDC), but there's no separate token-supply field decoupled from USDC cap. |
| S5 | Both USDC and OTC count toward total raised | ⚠️ | `totalRaised` is incremented in both `buy` and `buyOTC` — but using mixed units. This works **only if 1 OTC token = 1 USDC raw unit** (both 6 decimals). The contract doesn't enforce the 1:1 peg. |
| S6 | OTC pegged 1:1 to USDC | ⚠️ | OTC token contract hardcodes 6 decimals (matching USDC). But there's no contract enforcement that 1 OTC = 1 USDC of value — that's purely off-chain convention via how the issuer mints. |
| S7 | Issuer or admin can finalize when hard cap reached | ✅ | `finalizeSale()` is `onlyIssuerOrAdmin`. Also auto-finalizes inline. |
| S8 | Issuer or admin can finalize when **all tokens sold** | ❌ | Only hardcap (USDC) triggers auto-finalize. No "all tokens sold" check. Would need a `totalTokenSupply` field to compare against `Σ phase.sold`. |
| S9 | Issuer can withdraw proceeds after success | ✅ | `withdrawFunds()` |
| S10 | Successful finalization sends fees to platform fees manager | ✅ | `_finalize()` success branch |
| S11 | If soft cap not met → failed sale | ✅ | `_finalize()` failed branch |
| S12 | Failed sales show as "completed" in the UI | ❌ (frontend) | The contract status is `FinalizedFailed`. The launchpad UI currently shows it as failed. Easy frontend rename. |
| S13 | Refund only after admin/issuer activates it | ❌ | Today the refund is available the instant `_finalize()` writes `FinalizedFailed`. No admin gate. |

### Phase-level

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| P1 | No phase can start before sale start date | ✅ | `phase.startTime >= saleStartTime` (round 4, `PhaseOutsideSaleWindow`) |
| P2 | No phase can end after sale end date | ✅ | `phase.endTime <= saleEndTime` (round 4) |
| P3 | **Phases can't overlap** | ❌ | `addPhase()` doesn't check overlap with existing phases. An issuer can add Phase A `[Apr 7, Apr 10]` and Phase B `[Apr 8, Apr 12]` — both would buy concurrently. |
| P4 | New phase can be added anytime by issuer | ⚠️ | Yes (Draft or Active), **but** there's no way to know if it slots between existing phases without overlap (P3) and no enforcement that it slots into "free" sale window. |
| P5 | New phase only if tokens still available | ❌ | For PhaseAllocated, `Σ allocation <= hardCap` is enforced, but that's against USDC cap, not token supply. For PriceTiered, no check at all. |
| P6 | Issuer can specify supply per phase | ⚠️ | Each phase has an `allocation` field, but it's only enforced in `PhaseAllocated` mode (a per-sale flag, not per-phase). |
| P7 | Issuer can keep all available supply in one phase | ⚠️ | In `PriceTiered` mode the per-phase allocation is ignored, so a single phase effectively has access to the global cap. But it's not a per-phase choice. |
| P8 | Subsequent phases can also have fixed or available supply | ❌ | The choice is global (`saleStructure`), not per-phase. Can't mix fixed-allocation and unlimited phases in the same sale. |
| P9 | Min contribution per phase | ✅ | `phase.minContribution > 0` (round 3) |
| P10 | Allow buying remaining when remaining < min cap | ❌ | `BelowMinContribution` reverts unconditionally for first-time buyers. No "last chunk" exception. |
| P11 | Min top-up cap (configurable) for repeat buyers | ❌ | The min check only applies on first buy (`totalContributed[buyer] == 0 && amount < phase.minContribution`). Subsequent buys have no minimum at all. The user wants a separate "min top-up" config. |
| P12 | Issuer can extend end time of active/upcoming phase | ❌ | No `extendPhase()` / `updatePhase()` function exists. |
| P13 | Extension must not overlap next phase's start | ❌ | Can't extend, so this check doesn't exist. |

### Refund flow

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| R1 | Refund only for on-chain (USDC) purchases | 🐛 | `claimRefund` returns `contrib.amount` which is the sum of buy + buyOTC. **Critical bug** — see §1.10. |
| R2 | Burn fractions to claim refund | ✅ | Vested mode burns full balance |
| R3 | Return exact USDC amount paid | 🐛 | "Exact" is true mathematically (`contrib.amount`) but it's the wrong number — includes OTC. |
| R4 | Account for purchases across phases at different prices | ⚠️ | Sum is correct in USDC because `contrib.amount` is just incremented; per-phase price history is NOT recorded. If you only need "give back what they paid" the sum works. If you ever need partial refunds, you can't reconstruct. |
| R5 | Two fraction token IDs (id 1 = USDC, id 2 = OTC) | ❌ | Today there's a single ERC-20 fraction token with no IDs. Needs ERC-1155 (or two separate fraction contracts). |
| R6 | Only id 1 fractions can claim refund | ❌ | Follows from R5 |
| R7 | Manual refund for OTC purchases | ⚠️ | Today "manual" is whatever the admin does off-chain — there's no contract function for OTC refunds at all, and `claimRefund` doesn't distinguish, so OTC investors who try the on-chain refund will silently get USDC they aren't owed. |
| R8 | Refund only after admin/issuer activates it | ❌ | No admin activation gate. Refund is open the instant `FinalizedFailed`. |
| R9 | Fraction tokens must be burnable on refund | ✅ | `burnFrom` exists and is called |
| R10 | No room for error | 🐛 | Significant accounting bug today (R1) |

### Vesting / claim

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| V1 | Cliff and vesting period | ✅ | `vestingConfig` |
| V2 | Cliff < vesting duration enforced | ✅ | `InvalidVestingConfig()` round 4 |
| V3 | Claim works per vesting schedule | ✅ | `vault.claim()` linear-after-cliff |
| V4 | UI allows claim | ✅ | (Frontend exists; not part of contract scope) |
| V5 | Fractions burned on claim | ✅ | `vault.claim` burns then transfers |

### Auto-finalize "all tokens sold"

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| F1 | Finalize when hard target reached | ✅ | `totalRaised >= hardCap` |
| F2 | Finalize when all tokens sold | ❌ | No `totalTokenSupply` tracking. For PhaseAllocated, `totalPhaseAllocation` exists but isn't compared to `Σ phase.sold` anywhere. For PriceTiered, there's no token supply concept at all. |

---

## Part 3 — Blind spots and risks

These came up during the deep read and aren't on the requirements list above
but warrant fixing.

### B1 — `Contribution.isOtc` is a single-bit flag that flips
The struct field is overwritten on every contribution. If a buyer does
`buyOTC` then `buy`, the flag is `false`. There is no way to query "did this
investor make any OTC contribution?" from the struct alone — you have to read
`otcAllocations[addr] > 0` instead. Inconsistent and confusing. **Remove the
flag** or rename it to something more honest.

### B2 — Per-investor `vestingStart` field is dead code
`InvestorVesting.vestingStart` exists in the struct but is never set. The
calculation always falls back to global `vestingStartTime`. Either implement
per-investor stagger (e.g. cliff starts on individual purchase date) or
remove the field.

### B3 — Fractions are practically non-transferable
The fraction token allows KYC-verified peer transfers, but the vault tracks
allocations against the **original buyer's** address. If Alice transfers her
fractions to Bob, Bob holds the fractions but `vault.investorVesting[Bob]`
is empty — `vault.claim()` returns 0 for Bob. The fractions are effectively
soul-bound for vesting purposes. The transferability is misleading and either
the vault should follow fraction balances, or transfers should be disabled.

### B4 — `_finalize()` runs inline during the buyer's tx
The buyer who pushes `totalRaised` to `hardCap` pays the gas for the entire
finalize sequence — fee transfer, vault start vesting, etc. Heavy gas spike
for the unlucky buyer. Worth either: (a) deferring finalize to a separate tx,
or (b) setting a flag and letting the next admin/issuer call `finalizeSale()`.

### B5 — Decimals assumption hardcoded
`tokensToAllocate = (amount * 1e18) / pricePerToken` assumes the project token
has 18 decimals and `pricePerToken` is also pre-scaled. Any project using a
non-18-decimal token (USDC-style 6 dec, BTC-style 8 dec, etc.) will compute
allocations off by orders of magnitude. There's no on-chain validation of
token decimals at init.

### B6 — No KYC re-verification at claim time
A buyer who passes KYC at purchase, then is later removed from the registry,
can still claim vested tokens. Probably intentional, but worth deciding: should
removal cascade to claim eligibility?

### B7 — No phase price history
`contributions[buyer].amount` is the only USDC tracking. Multi-phase, multi-price
scenarios lose the per-phase breakdown. If anyone ever asks "show me the average
price this buyer paid", you need a subgraph; the contract can't answer.

### B8 — `totalOtcAllocated` semantics
This counter increments with `tokensToAllocate` (i.e. the fraction token amount,
not the OTC token amount paid). It's used **nowhere** in the contract — no view
function reads it, no fee calc uses it. Looks like dead state. Remove or use it.

### B9 — Whitelist mutable mid-phase
`setWhitelist()` has no check that the phase has not started. An issuer can
add or remove addresses after the phase is live, breaking fairness guarantees.
Lock the whitelist once a phase is active.

### B10 — `OTCAllocation` event references a function that doesn't exist
There's an `event OTCAllocation(...)` declared but no function in the live
contract emits it. The off-chain OTC allocation flow that used to emit it lives
in a separate `issuerAllocate()` function which I haven't read in this audit;
worth verifying it still exists / matches.

### B11 — Cliff is "delayed start of linear", not "release a chunk at cliff"
Many projects expect `cliff = 30d, vesting = 365d` to mean: "0% for 30d, then
30d/365d ≈ 8.2% available, then linear from there to 100% at day 365."
Cireta's math gives exactly that. But other projects expect: "0% for 30d, then
8.2% releases all at once on day 30, then linear from 30 to 365 with the
remaining 91.8%." Document the chosen semantics, because issuer expectations
differ.

### B12 — No "max wallets per investor" type sybil check
Anyone can make a new wallet, KYC it (or not, on testnet), and buy again.
Compliance burden lives in the registry layer. Document that the contract
doesn't enforce this.

---

## Part 4 — Plan

The current contract roughly serves about 60% of the requirements. Some gaps
are 1-line fixes; others require structural changes (ERC-1155 fractions, per-phase
sale structure, phase update functions). Bundling them by effort:

### Stage A — Cheap quick wins (hours)

| # | Fix | Where | Effort |
| --- | --- | --- | --- |
| A1 | Refund admin-activation gate | New `bool refundsActive` + `activateRefunds()` admin/issuer only; gate `claimRefund` on it | XS |
| A2 | Status `FinalizedFailed` shows as "Completed" in UI | Frontend label only | XS |
| A3 | Whitelist locked after phase starts | Add `phase.startTime > now` check in `setWhitelist` | XS |
| A4 | Remove `Contribution.isOtc` (B1) and `totalOtcAllocated` (B8) dead state | Storage cleanup | XS |
| A5 | Lock fractions to be soul-bound (B3) — disable peer transfers | `_update` revert on peer transfer | XS |
| A6 | "Last chunk" exception in `BelowMinContribution` check (P10) | `if (amount < phase.minContribution && tokensToAllocate < remaining(phase))` skip the check | S |

### Stage B — Structural additions (a day each)

| # | Fix | Where | Effort |
| --- | --- | --- | --- |
| B1 | Add `totalTokenSupply` to Sale, set in init, validate in `addPhase` and `buy/buyOTC` (P5, F2, S4) | New storage field + addPhase Σ check + buy "all sold" check | M |
| B2 | Auto-finalize on "all tokens sold" (F2) | `_finalize` trigger when `totalSold >= totalTokenSupply` | XS once B1 lands |
| B3 | Phase overlap detection in `addPhase` (P3) | Linear scan over existing phases for time overlap | S |
| B4 | `extendPhase(phaseId, newEndTime)` function (P12, P13) | Issuer-only, validates ≤ next phase start, ≤ saleEndTime | S |
| B5 | Per-phase `topUpMin` config + enforcement (P11) | New phase field, set in addPhase, checked in buy when buyer has prior contribution | S |
| B6 | Per-phase `allocationMode` (Fixed vs UseRemaining) instead of global SaleStructure (P6, P7, P8) | Refactor SaleStructure into per-phase enum; addPhase validates accordingly | M |
| B7 | OTC peg enforcement (S6) — store/validate that OTC token amount paid translates 1:1 | Might just be docs + a unit test | XS |

### Stage C — The big one (multi-day)

| # | Fix | Where | Effort |
| --- | --- | --- | --- |
| C1 | **ERC-1155 fraction token with id 1 (USDC) + id 2 (OTC)** (R5, R6) | Replace `CiretaFractionToken` (ERC-20) with `CiretaFractionToken1155`. Sale mints id 1 in `buy` and id 2 in `buyOTC`. Vault tracks per-id totals and per-id claim state. Refund only burns id 1 + transfers USDC. | L |
| C2 | Refund accounting bug fix (R1, R3, R7) | Once C1 lands, `claimRefund` only refunds id-1-backed contributions. OTC refunds become a separate manual flow with its own admin-gated function (or off-chain entirely). Track `usdcContributedExcludingOtc` per investor. | M |
| C3 | Per-phase price history (R4, B7) | Each contribution becomes an array entry: `{phaseId, amount, tokensAllocated, isOtc}`. Sum-based queries become array-walks but allow exact reconstruction. | M |

### Stage D — Polish

| # | Fix | Where | Effort |
| --- | --- | --- | --- |
| D1 | Defer auto-finalize to separate tx (B4) | Replace inline `_finalize()` call with `finalizationPending = true` flag | S |
| D2 | Remove `vestingStart` dead code from vault (B2) | Storage cleanup | XS |
| D3 | Token decimals validation (B5) | Read `IERC20Metadata(token).decimals()` in init, store, use in calc | S |
| D4 | KYC re-verification on claim (B6) | Add `isVerified(msg.sender)` check in `vault.claim` and `sale.claimTokens` | XS |
| D5 | Document or implement per-investor vesting start (B2) | Decision needed | XS |
| D6 | Cliff release semantics (B11) — choose and document | Decision needed | XS |
| D7 | Verify `OTCAllocation` event still fires from `issuerAllocate` (B10) | Read code | XS |

---

## Part 5 — Open questions for you to clarify

These are the spots where I made an interpretation that may be wrong:

### Q1 — "Total supply of the tokens up for sale is decided at the time of sale creation"
How do you want to express this on-chain?
- Option (a): `totalTokenSupply` is a separate field (in token units) set in init. `addPhase()` validates `Σ phase.allocation ≤ totalTokenSupply`. `buy()` validates `Σ phase.sold ≤ totalTokenSupply`. `hardCap` (USDC) and `totalTokenSupply` (token units) are independent caps.
- Option (b): Derive from `hardCap / cheapest_price` (the maximum tokens an issuer would ever sell if everyone bought at the lowest tier). Brittle.
- Option (c): Inferred from how many tokens the issuer deposits before activation. **Current implicit behavior** but not validated.

I'd recommend (a). Worth confirming.

### Q2 — "Issuer can decide to specify the supply for the phase or keep all the available supply in a phase"
Do you mean:
- Per-phase choice: each phase can independently be "fixed allocation X tokens" or "all remaining"? **(B6 in the plan)**
- Or: the global `SaleStructure` (current behavior) is enough, and issuers either run a fully PhaseAllocated sale or a fully PriceTiered sale?

If per-phase, structural change. If global, today's `SaleStructure` covers it (just need a per-phase explanation).

### Q3 — "Each OTC token is pegged 1:1 to USDC. Both count toward total raised"
Concretely: if hard cap is $10M and an issuer mints 5M OTC tokens to a wallet that buys all 5M in `buyOTC`, then USDC buyers can only buy $5M more before the hardcap triggers? Yes/no?

Today's contract already does this — `buyOTC` increments `totalRaised` by the OTC amount. I want to confirm this is the intended semantics. If so, what's the policy if the issuer mints more OTC than the hardcap allows? Today the contract would silently let them mint, then `buyOTC` would revert with `ExceedsHardCap`.

### Q4 — "Two fraction token IDs"
ERC-1155 with id 1 + id 2 — confirm that's the intended approach over two separate ERC-20 contracts. ERC-1155 is more gas-efficient and a single deployment, but the existing code is ERC-20 — this is the biggest refactor on the list.

### Q5 — Auto-finalize on hardcap inline
Today `buy()` auto-finalizes inline if hardcap is hit. The buyer pays gas for the entire `_finalize()` sequence. You said "issuer or admin can finalize" — does that mean **only** they can, and the inline auto-finalize should be removed entirely? Or auto-finalize stays as a fallback and they can still call it manually?

### Q6 — "Failed sale shows as Completed in the UI"
Is this just a label change, or does it imply that **on-chain** the sale should look "successful" too? I assume label only, but worth confirming.

### Q7 — "Refund only allowed for on-chain purchases via fractions id 1"
With ERC-1155 in place, do we also want a function for issuer to manually trigger an OTC refund (e.g., issuer transfers USDC off-chain, calls `markOtcRefunded(investor)`), or are OTC refunds 100% off-chain with no contract record?

### Q8 — "Min top-up cap"
Is this per phase or per sale? Should it be a single number or different for each phase? My read: per phase, set in `addPhase`. Confirm.

### Q9 — "Anyone can top up with any amount but not tiny amounts"
Is this the same as Q8 or distinct? I read it as: same thing — repeat buyers have a min top-up requirement. Confirm.

### Q10 — Refund activation
Is "activate refunds" a one-way switch (once on, always on), or can it be toggled? I'd recommend one-way with an `EnableRefunds` event.

### Q11 — Phase extension
When the issuer extends a phase end time, what are the constraints?
- Must be > current `endTime`?
- Must be ≤ next phase's `startTime`?
- Must be ≤ `saleEndTime`?
- Must be in the future?

I'd say all four. Confirm.

### Q12 — Total supply token unit
For ERC-20 project tokens with 18 decimals, "total supply 1,000,000 tokens" stored on-chain as `1_000_000 * 1e18`. Is the issuer's input in human units (1,000,000) or raw (`1e24`)? Backend probably normalizes, but it affects the validation messages.

---

Once you've answered these, I'll write the round-5 implementation. The full
plan would land as **one breaking-change PR** (because of the fraction token
refactor), be deployed as part of the [`FRESH_DEPLOY_PLAN.md`](./FRESH_DEPLOY_PLAN.md)
fresh-redeploy, and skip any UUPS-upgrade dance on existing testnet sales.
