# Rounding & Math Audit — Sale Lifecycle

**Date:** 2026-04-11
**Scope:** Token allocation formula, vesting, claims, refunds, fees, supply tracking
**Contracts:** Sale.sol, CiretaVault.sol, CiretaFractionToken1155.sol

---

## Core Formula

```solidity
tokensToAllocate = (amount * (10 ** tokenDecimals)) / pricePerToken;
```

- `amount` = payment token raw units (what the user pays)
- `tokenDecimals` = project token decimals (read from IERC20Metadata at init)
- `pricePerToken` = price in payment token raw units (how much 1 whole token costs)

Solidity integer division truncates (rounds down). The investor always receives
slightly fewer tokens than the mathematically exact value.

**Works for any decimal combination:** payment token can be 2, 6, 12, or 18
decimals; project token can be 6, 9, 12, or 18 decimals. The formula
self-adjusts because `amount` and `pricePerToken` are both in payment token
raw units (they cancel), and `10^tokenDecimals` scales the result.

**Rule:** `pricePerToken = dollarPrice * 10^paymentTokenDecimals`

---

## Stage-by-Stage Analysis

### 1. BUY — Token Allocation (Sale.sol:701)

```solidity
tokensToAllocate = (amount * (10 ** tokenDecimals)) / pricePerToken;
```

**Rounding:** Truncates down. Investor receives fewer tokens than exact value.

**Dust per buy:**
```
lost_raw = (amount * 10^tokenDecimals) % pricePerToken
```

| Price/Token | Payment (6 dec) | Token (6 dec) | Dust Lost | Dollar Value |
|---|---|---|---|---|
| $1 | $5,000 | 5,000.000000 | 0 | $0.00 |
| $85,000 | $100,000 | 1.176470 | 0.000000588... | ~$0.05 |
| $0.50 | $5,000 | 10,000.000000 | 0 | $0.00 |

**Finding #1 (LOW):** Investor pays full USDC but receives fewer tokens. The
rounding dust stays as unallocated supply (`totalTokenSupply - totalTokenSold`).
Not a vulnerability — max loss is `pricePerToken - 1` raw units per buy.

---

### 2. Phase Sold Tracking (Sale.sol:708-710)

```solidity
phase.sold += tokensToAllocate;
totalTokenSold += tokensToAllocate;
```

Both counters use the same truncated `tokensToAllocate`. Consistent with
fractions minted. **No gap.**

---

### 3. Hard Cap Check (Sale.sol:682)

```solidity
if (totalRaised + amount > hardCap) revert ExceedsHardCap();
```

`totalRaised` tracks USDC (exact), not tokens. No rounding. **No gap.**

---

### 4. Total Supply Check (Sale.sol:694)

```solidity
if (totalTokenSold + tokensToAllocate > totalTokenSupply) revert TokenSupplyExceeded();
```

**Finding #2 (LOW):** Unreachable supply tail. Because each buy truncates,
`totalTokenSold` can never exactly reach `totalTokenSupply`. A remainder of
`< pricePerToken` raw token units will always be left unsellable — the next buy
would allocate 0 tokens and revert with `AmountTooSmall`.

The "last chunk" exception (line 665-668) partially addresses this for
first-time buyers, but if the remaining supply is 1 raw unit, no USDC amount
can produce `tokensToAllocate >= 1` without rounding down to 0.

**Impact:** A few wei of tokens permanently unsold. Economically negligible.
The sale can never display exactly 100% sold.

---

### 5. Fee Calculation (_finalize, Sale.sol:804)

```solidity
fee = (paymentContributedTotal * feeBasisPoints) / 10000;
```

Truncates down. Platform receives slightly less than the exact percentage.

Max loss: `9999 / 10000` raw units per finalization = $0.000001 for USDC.
**No gap.**

---

### 6. Vesting Math (CiretaVault.sol:298-303)

```solidity
function _calculateVested(uint256 totalFractions) internal view returns (uint256) {
    if (vestingStartTime == 0 || totalFractions == 0) return 0;
    uint256 elapsed = block.timestamp - vestingStartTime;
    if (elapsed < vestingConfig.cliffDuration) return 0;
    if (elapsed >= vestingConfig.vestingDuration) return totalFractions;
    return (totalFractions * elapsed) / vestingConfig.vestingDuration;
}
```

**Finding #3 (NONE — self-correcting):** Each intermediate claim truncates the
vested amount. If an investor claims daily over 180 days, worst-case cumulative
loss from rounding is ~180 raw units = 0.000180 tokens (for 6-dec token).

**However:** When `elapsed >= vestingDuration`, the function returns
`totalFractions` exactly. The final claim sweeps the entire remainder.
**No permanent loss.** Rounding only affects timing of intermediate claims.

---

### 7. Claim (CiretaVault.sol:212-249)

```solidity
claimableUsdc = _calculateClaimable(iv.totalUsdcFractions, iv.claimedUsdc);
// ...cap by ERC-1155 balance...
iv.claimedUsdc += claimableUsdc;
totalReleased += total;
totalOutstandingFractions -= total;
fractionToken.burn(msg.sender, ID_USDC, claimableUsdc);
projectToken.safeTransfer(msg.sender, total);
```

**Finding #4 (NONE):** The ERC-1155 balance cap (lines 224-231) prevents
over-release if fractions were burned via refund but `investorVesting` wasn't
cleared. Correct defensive code.

**Finding #5 (NONE):** `totalOutstandingFractions` is balanced because
`recordAllocation` and `claim` use the same truncated values. When all investors
claim fully, `totalOutstandingFractions` reaches 0.

---

### 8. Refund (Sale.sol:850-875)

```solidity
uint256 refundAmount = paymentContributed[msg.sender];
paymentToken.safeTransfer(msg.sender, refundAmount);
```

**No rounding.** Refund returns exact USDC paid. Truncated tokens are irrelevant
— fractions are burned, not converted back. **No gap.**

---

### 9. Withdraw Excess (CiretaVault.sol:192-201)

```solidity
uint256 remainingLocked = totalLocked - totalReleased;
if (remainingLocked <= totalOutstandingFractions) revert NothingToClaim();
uint256 excess = remainingLocked - totalOutstandingFractions;
```

**Finding #6 (MEDIUM):** Abandoned fractions lock tokens permanently. The issuer
deposits `totalTokenSupply` into the vault. Due to buy-side rounding,
`sum(tokensAllocated)` < `totalTokenSupply`. The difference is withdrawable via
`withdrawExcess()` after finalization.

However, if investors abandon fractions (never claim), `totalOutstandingFractions`
never reaches 0. Those project tokens are locked in the vault forever. No
mechanism exists to recover them.

**Example:** Investor buys 5000 tokens, never claims. 5000 project tokens
stay locked. If 10% of investors abandon → 10% of tokens locked permanently.

**Recommendation:** Consider adding:
- `claimOnBehalf(address investor)` — admin/issuer can claim vested tokens on
  behalf of an absent investor (sends to the investor's address)
- Or a time-based recovery: after `vestingDuration + N years`, issuer can
  recover unclaimed tokens

---

### 10. HardCap vs TokenSupply Finalization (Sale.sol:731)

```solidity
if (totalRaised >= hardCap || totalTokenSold >= totalTokenSupply) {
    finalizationPending = true;
}
```

These two conditions can diverge (hardCap hit before all tokens sold, or all
tokens sold before hardCap). The `||` handles both correctly. **No gap.**

---

## Summary Table

| # | Finding | Severity | Impact | Fix Needed? |
|---|---|---|---|---|
| 1 | Investor overpays by rounding dust per buy | **Low** | Max ~$0.05/buy at $85k/token; < $0.000001 at $1/token | No |
| 2 | Unreachable supply tail — last raw token units unsellable | **Low** | < 1 token permanently unsold | No |
| 3 | Vesting intermediate claims lose dust | **None** | Final claim sweeps remainder; no permanent loss | No |
| 4 | Fraction balance cap in claim (defensive) | **None** | Already handled correctly | No |
| 5 | `totalOutstandingFractions` consistency | **None** | Math is balanced | No |
| 6 | Abandoned fractions lock tokens in vault forever | **Medium** | Real tokens locked if investors disappear | Consider recovery mechanism |
| 7 | hardCap vs totalTokenSupply divergence | **None** | `\|\|` handles both cases | No |

---

## Conclusion

The rounding math is sound across the entire lifecycle. No exploitable gaps,
no loss-of-funds bugs, no overflow/underflow risks.

The only structural concern is **Finding #6** — abandoned fractions with no
recovery path. This isn't a rounding issue but a lifecycle gap. A time-bound
recovery mechanism (e.g. issuer can recover unclaimed tokens after
`vestingDuration + 2 years`) would close it.

All other findings are standard Solidity integer-division dust that is
economically negligible (sub-cent per transaction).
