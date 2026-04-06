# Sale Contract Architecture — Deep Analysis & Gap Assessment

## Context

The user wants a thorough analysis of how the sale contract works, specifically:
- Start/end dates (sale-level vs phase-level)
- Soft/hard caps (sale-level vs phase-level)
- When and who can call finalize
- Comparison with the old model (no phases, hard start/end dates, admin-only finalize)
- Gap analysis from investor, issuer, and admin perspectives

## Current Architecture Summary

### How It Works Now (Phase-Based)

**Sale-Level Fields:**
- `softCap` / `hardCap` — USDC fundraising limits (sale-level only)
- `totalRaised` — cumulative from all phases
- `status` — single state machine for entire sale
- `feeBasisPoints` / `feeCapUsdc` — platform fee config

**Phase-Level Fields (array of structs):**
- `startTime` / `endTime` — each phase has its own window
- `pricePerToken` — different prices per phase (e.g., seed $1, public $2)
- `allocation` — max tokens per phase (PhaseAllocated mode)
- `minContribution` / `maxContribution` — per-investor limits per phase
- `whitelistOnly` — per-phase gating

**Key Design Decisions:**
1. **NO sale-level start/end date** — timing is entirely phase-driven
2. **Soft/hard caps are sale-level only** — no per-phase caps
3. **Caller specifies phaseId** in `buy()` — no auto-detection on-chain
4. **Finalize is callable by issuer OR admin** — no time-based auto-trigger
5. **Finalize can be called at ANY time** while sale is Active/Paused

---

## Critical Gap Analysis

### GAP 1: No Sale-Level End Date = Finalization is Voluntary

**Problem:** There's no enforced deadline. The sale stays Active forever until someone calls `finalizeSale()`. If the issuer disappears and admin doesn't act, investors' funds are trapped in the contract indefinitely.

**Old Model:** Had a hard `endTime` — after it passed, nobody could buy, and finalization was deterministic.

**Impact:**
- **Investor risk:** Funds locked with no guaranteed timeline for resolution
- **Regulatory risk:** Open-ended fundraising may violate securities regulations (most offerings have defined close dates)
- **Admin burden:** Must monitor every sale for when to finalize

**Recommendation:** Add a `saleEndTime` at the sale level. After this timestamp:
- `buy()` reverts (no more contributions)
- Anyone can call `finalizeSale()` (not just issuer/admin)
- Or: auto-finalize on first interaction after `saleEndTime`

### GAP 2: Finalize Can Be Called Too Early

**Problem:** Issuer can call `finalizeSale()` at any time while Active. If soft cap isn't met yet but the sale still has time, a malicious or impatient issuer could finalize as FAILED and reclaim tokens, harming investors who expected the full phase duration.

**Old Model:** Finalize only possible after end date.

**Impact:**
- **Investor trust:** Investors commit funds expecting the full sale window; early finalization breaks that promise
- **Issuer abuse:** Issuer could use early finalization to manipulate outcomes

**Recommendation:** Finalization should only be allowed:
- After ALL phases have ended (i.e., `block.timestamp > lastPhase.endTime`), OR
- If hard cap is reached (auto-finalize, already implemented), OR  
- Admin override with explicit reason (emergency only)

### GAP 3: OTC Counts Toward Hard Cap but NOT Toward Soft Cap

**Problem in code (Sale.sol:463):**
```solidity
totalRaised += amount; // OTC counts toward hard cap
```
But in the backend, OTC has `amount=0` and doesn't count toward `total_raised_on_platform`. On-chain however, `totalRaised` includes OTC.

**The inconsistency:** On-chain, OTC counts toward `totalRaised` which means it counts toward BOTH hard cap AND soft cap. But the backend tracks it separately. If the backend is used for finalization logic, there's a mismatch.

**Impact:** Sale could appear to fail soft cap in the backend but succeed on-chain, or vice versa.

**Recommendation:** Clarify the intended behavior:
- Option A: OTC counts toward soft cap (current on-chain behavior) — update backend to match
- Option B: OTC doesn't count toward soft cap — add separate `onPlatformRaised` tracker on-chain

### GAP 4: No Automatic Phase Transitions

**Problem:** Phases are independent time windows. There's no on-chain enforcement that phases are sequential or non-overlapping. Two phases could be active simultaneously. The frontend asks the investor to pass `phaseId` which is fragile.

**Impact:**
- **UX confusion:** Investor must know which phase to buy into
- **Front-running:** Investor could buy into a cheaper earlier phase if times overlap
- **Issuer error:** Misconfigured overlapping phases could allow unintended pricing

**Recommendation:**
- Add validation in `addPhase()`: new phase `startTime >= previousPhase.endTime`
- Or: change `buy()` to auto-detect the active phase (loop through phases, find the one where `startTime <= now <= endTime`)

### GAP 5: No Time-Based Buy Prevention After Sale End

**Problem:** There's no sale-level time check in `buy()`. Only phase-level `startTime`/`endTime` is checked. If an issuer adds a new phase (they can in Active status) with future dates, the sale effectively never ends.

**Old Model:** `buy()` checked `block.timestamp <= sale.endTime` — hard cutoff.

**Impact:**
- **Regulatory:** Offering period must have a definite end
- **Investor expectation:** "The sale runs from X to Y" must be enforceable

**Recommendation:** Add `saleEndTime` check at the top of `buy()`:
```solidity
if (block.timestamp > saleEndTime) revert SaleEnded();
```

### GAP 6: Contribution Tracking is Per-Address, Not Per-Phase

**Problem:** `contributions[msg.sender]` is a single struct. If an investor buys in Phase 1 and Phase 2, their amounts are summed. But `maxContribution` check uses `totalContributed[msg.sender]` which is cumulative across all phases.

**Impact:** If Phase 1 has maxContribution=$1000 and Phase 2 has maxContribution=$5000, an investor who put $1000 in Phase 1 can only put $4000 in Phase 2 (because cumulative check: $1000 + $4000 = $5000).

**This may or may not be intended.** If per-phase limits are meant to be independent, this is a bug. If cumulative is desired, it should be documented.

**Recommendation:** Clarify intent. If per-phase limits should be independent, track `phaseContributed[phaseId][msg.sender]` separately.

### GAP 7: Refund Only Returns On-Platform Amount

**Problem:** `claimRefund()` returns `contributions[msg.sender].amount` which includes both USDC and OTC contributions (since `buyOTC` also adds to `amount`). But OTC payments were in OTC tokens (now burned), not USDC. The contract tries to refund USDC for OTC purchases it never received.

**Code (Sale.sol:463):**
```solidity
// In buyOTC:
contributions[msg.sender].amount += amount;  // Added to same pool as USDC
```

**Code (Sale.sol:540):**
```solidity
// In claimRefund:
uint256 refundAmount = contrib.amount;  // Includes OTC amount!
paymentToken.safeTransfer(msg.sender, refundAmount);  // Tries to send USDC for OTC
```

**Impact:** If an investor contributed via OTC and the sale fails, the contract tries to refund USDC it doesn't have. Transaction will revert due to insufficient balance.

**Recommendation:** Track on-platform and OTC amounts separately:
```solidity
struct Contribution {
    uint256 usdcAmount;      // Actual USDC deposited
    uint256 otcAmount;       // OTC token value (burned, not refundable in USDC)
    uint256 tokensAllocated;
    bool claimed;
    bool refunded;
}
```
Refund only `usdcAmount`.

### GAP 8: No Partial Withdrawal for Issuer

**Problem:** `withdrawFunds()` transfers the ENTIRE USDC balance to the issuer. No support for partial withdrawals or milestone-based releases.

**Impact:**
- **Investor risk:** Issuer gets all funds at once, no accountability for delivery
- **Platform risk:** No mechanism to hold funds if issuer doesn't deliver

**Recommendation:** Consider milestone-based withdrawal or at minimum add partial withdrawal support:
```solidity
function withdrawFunds(uint256 amount) external onlyIssuer {
    require(amount <= paymentToken.balanceOf(address(this)));
    paymentToken.safeTransfer(issuer, amount);
}
```

### GAP 9: Direct Mode Sends Tokens on Buy (Before Finalization)

**Problem:** In Direct mode, `buy()` immediately transfers project tokens to the investor (`IERC20(token).safeTransfer(msg.sender, tokensToAllocate)`). This happens BEFORE the sale is finalized.

**Impact:**
- If the sale later fails (soft cap not met), investors already have tokens AND can claim refunds
- Double-spend: investor gets tokens + USDC refund

**This is a critical bug in Direct mode.**

**Recommendation:**
- Direct mode should hold tokens until finalization, like Vested mode holds them in the vault
- Or: Direct mode should not allow refunds (but this contradicts investor protection)
- Or: Remove Direct mode entirely and always use Vested mode (cleaner but more gas)

### GAP 10: Emergency Withdraw Delay is 90 Days

**Problem:** Admin can only emergency-withdraw after 90 days. If the issuer is compromised or malicious, investors must wait 90 days.

**Recommendation:** Consider a shorter delay (30 days) or a multi-sig emergency mechanism.

---

## Comparison: Old Model vs New Model

| Feature | Old Model (No Phases) | New Model (Phases) | Verdict |
|---------|----------------------|-------------------|---------|
| Start/End Date | Sale-level, enforced | Phase-level only | **Old is safer** — needs sale-level enforcement |
| Soft/Hard Cap | Sale-level | Sale-level | Same |
| Buy cutoff | `endTime` enforced | No sale-level cutoff | **Old is safer** |
| Finalize trigger | Admin only, after endTime | Issuer OR Admin, anytime | **New is flexible but risky** — needs time guard |
| Refund | Automatic on failed sale | Investor-initiated after finalization | **New is better** — trustless |
| Withdrawal | Admin-controlled | Issuer-controlled | **New is better** — issuer autonomy |
| Token delivery | After finalization | Direct: immediate (BUGGY), Vested: after cliff | **Vested is correct** |
| Price flexibility | Single price | Per-phase pricing | **New is better** |
| Investor limits | Sale-level | Per-phase (but cumulative) | **New is more granular** |

---

## Recommendations Summary (Priority Order)

### P0 — Critical Bugs
1. **Fix Direct mode double-spend** — tokens sent before finalization means refund + tokens
2. **Fix OTC refund overflow** — `claimRefund()` tries to refund USDC for OTC purchases

### P1 — High Priority Gaps
3. **Add `saleEndTime`** — enforced deadline at sale level, `buy()` reverts after it
4. **Guard `finalizeSale()` with time check** — only after all phases ended (or hard cap)
5. **Separate USDC and OTC contribution tracking** — for accurate refunds

### P2 — Medium Priority
6. **Auto-detect active phase in `buy()`** — don't require caller to pass `phaseId`
7. **Validate phase non-overlap in `addPhase()`** — prevent misconfiguration
8. **Clarify `maxContribution` scope** — per-phase or cumulative?

### P3 — Nice to Have
9. **Partial withdrawal support** — milestone-based or partial amounts
10. **Shorter emergency delay** — 30 days instead of 90
11. **Sale-level `getCurrentPhase()` that frontend uses** — already exists as view function

---

## Files Involved

**Smart Contracts:**
- `contracts/src/sale/Sale.sol` — Main sale logic (all gaps are here)
- `contracts/src/vault/CiretaVault.sol` — Vesting vault (no issues found)
- `contracts/src/platform/CiretaSaleFactory.sol` — Deployment factory
- `contracts/src/otc/IssuerOTCToken.sol` — OTC payment token

**Backend:**
- `apps/api/services/sale_contribute_service.py` — Contribution + finalization logic
- `apps/api/services/sale_create_service.py` — Sale creation
- `apps/api/models/token_sale.py` — Sale DB model
- `apps/api/models/contribution.py` — Contribution DB model

**Frontend:**
- `apps/launchpad/src/app/invest/[slug]/page.tsx` — Investor buy flow
- `apps/admin/src/app/issuer/sales/[id]/page.tsx` — Issuer sale management

## Verification

After implementing fixes:
1. Run `cd contracts && npx hardhat test` — all contract tests pass
2. Test Direct mode: buy → finalize fail → verify investor can't keep tokens AND get refund
3. Test OTC refund: buyOTC → finalize fail → verify refund doesn't revert
4. Test sale end time: verify buy() reverts after saleEndTime
5. Test early finalize guard: verify finalize reverts if phases still active
