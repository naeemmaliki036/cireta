# Invest Flow — UX Gap Analysis

Audit of the buy/invest flow on the Cireta Launchpad. Gaps are listed in
priority order. Companion doc: [`BUY_FLOW_USDC_AND_OTC.md`](./BUY_FLOW_USDC_AND_OTC.md)
which describes how the flow is *meant* to work end-to-end.

Reviewed: 2026-04-10 against commit `ee4f450` on `staging`.

> **Status:** All in-app gaps (#1–12) **fixed** in the follow-up commit.
> #13 (test wallet topup script) is left as a separate operational task.
> See "Implementation order" at the bottom for the per-gap status check.

Files referenced:
- `apps/launchpad/src/app/invest/[slug]/page.tsx` — invest page (state, hooks)
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` — step components
- `apps/launchpad/src/app/project/[slug]/page.tsx` — project page Transactions tab
- `contracts/src/sale/Sale.sol` — Sale contract

---

## Critical (data lies / silent failures)

### 1. Tokens-allocated formatting — scientific notation / "0" in tables
**Where:** Project page Transactions tab (`project/[slug]/page.tsx`).
**Symptom:** A 100k USDC buy displays `0 tokens` in the row. Other rows render
`1.176470E-12 tokens` (scientific notation).
**Root causes (two stacked):**
- **Display:** `Number(tx.tokens_allocated).toLocaleString()` returns "0" for very
  small numbers (default `maximumFractionDigits = 3`).
- **Underlying scaling bug:** the on-chain price (`pricePerToken = 85,000 × 10¹⁸`)
  vs payment-token decimals (6) disagrees with the underlying token's 18 decimals.
  100k USDC raw → `tokens_allocated = 1.176e-12`. The UI confirm step shows
  `1.176 tokens` (computed in JS), but the user actually receives `1.176e-12`.
  **What the user sees ≠ what they get.**

**Fix:** smarter formatter that prints "<0.0001" or scientific for tiny values,
**plus** add a sanity check on the confirm step that flags when JS-computed
tokens vs. on-chain `(amount * 1e18) / pricePerToken` disagree. The deeper
contract scaling bug is sale-config and tracked separately.

### 2. Revert reason map is text-substring matching, no custom-error selectors
**Where:** `parseRevertReason` in `invest/[slug]/page.tsx:33-59`.
**Symptom:** Every contract revert becomes "Transaction failed. Please try again."
**Root cause:** `REVERT_MESSAGES` keys like `"kyc required"` are substring-matched
against the error string. Modern contracts use **custom errors** which viem
reports as a 4-byte selector (e.g. `0xa3e9d91e`) — none of those substrings match.

Missing mappings (Sale.sol + IssuerOTCToken.sol):

| Selector | Error | User-facing message |
| --- | --- | --- |
| `0xa3e9d91e` | `RecipientNotVerified(address)` | OTC token recipient not on identity registry. Sale contract may not be whitelisted yet — contact support. |
| `0x38ad1bbd` | `ExceedsBlockLimit()` | Exceeds the per-block contribution limit. Split into smaller transactions and try again. |
| `0x9a36fd9c` | `InvalidPhase()` | Invalid sale phase. |
| `0xf2469089` | `PhaseNotStarted()` | This sale phase has not started yet. |
| `0x663505c8` | `PhaseEnded()` | This sale phase has ended. |
| `0x8875a799` | `BelowMinContribution()` | Amount is below the minimum contribution. |
| `0x0cb363f2` | `ExceedsMaxContribution()` | Amount exceeds the maximum contribution per investor. |
| `0x45939939` | `ExceedsHardCap()` | This contribution would exceed the sale's hard cap. |
| `0x83855724` | `KYCRequired()` | Your wallet is not KYC-verified. |
| `0x584a7938` | `NotWhitelisted()` | Your wallet is not whitelisted for this phase. |
| `0x8541190c` | `ExceedsAllocation()` | This phase's token allocation is fully subscribed. |
| `0xcd28344a` | `OTCNotEnabled()` | OTC payment is not enabled for this sale. |
| `0xeda53895` | `InvestorNotVerified()` | Your wallet is not verified for this sale. |
| `0xb7b24097` | `SaleNotActive()` | Sale is not active. |
| `0xf525e320` | `InvalidStatus()` | Sale status does not allow this action. |

**Fix:** add a `CUSTOM_ERROR_SELECTORS` map keyed by 4-byte selector and
check the error data first, before falling back to string matching.

### 3. `maxPerBlock` invisible (50M cap, no warning)
**Where:** `InvestAmountStep` in `InvestFlow.tsx`.
**Symptom:** A user enters more than the per-block cap, clicks Continue, signs
in MetaMask, and the tx reverts. No upfront indication.
**Fix:** read `Sale.maxPerBlock()` once on mount, display "Per-block limit:
50,000,000 USDC" alongside min/max, and disable Continue if `amount > maxPerBlock`.

---

## High (friction / dead ends)

### 4. Wallet ETH balance check missing
**Where:** invest page, before approve/buy.
**Symptom:** If investor wallet has 0 ETH on Base, the tx fails at MetaMask
submission. No upfront UI warning.
**Fix:** `useBalance({ address })` and show a yellow banner "You need a small
amount of ETH for gas (≈0.0005 ETH). Your balance: X ETH." if below threshold.

### 5. OTC payment option vanishes silently when balance is 0
**Where:** `invest/[slug]/page.tsx:588-599` — `{hasOtcBalance && (...)}`.
**Symptom:** If a sale has OTC enabled but the investor has no vouchers, the
"OTC Token" tile is hidden entirely. The user has no way to learn that OTC is
even an option, let alone how to obtain vouchers.
**Fix:** render the tile as **disabled** when `hasOtcBalance === false`, with
copy "OTC Token (cOTCCOM) — 0 in wallet. Contact `otc@cireta.com` to request
an allocation."

### 6. No "your existing contribution" indicator
**Where:** `InvestAmountStep`.
**Symptom:** A user who already bought up to `phase.maxContribution` enters
another amount, gets `ExceedsMaxContribution` revert, has no idea why.
**Fix:** read `Sale.totalContributed[wallet]` and display "You've contributed
$X / $Y max" inline on the amount step. Disable Continue if `current + amount > max`.

### 7. OTC Token approve step missing compliance checkbox
**Where:** `invest/[slug]/page.tsx:719-735` (OTC token approve block).
**Symptom:** USDC approve step (`InvestApproveStep`) requires checking
"I confirm I am not a resident of a restricted jurisdiction" before enabling
the Approve button. The OTC token approve step has **no checkbox** — same
compliance disclosure should apply.
**Fix:** extract a shared `ComplianceAcknowledgment` component and use it in
both approve steps (and ideally on the confirm step too).

---

## Medium (cosmetics / consistency)

### 8. Hardcoded "Network Fee ~$0.10"
**Where:** Both confirm steps (`InvestConfirmStep` and the OTC token confirm
block in `invest/[slug]/page.tsx`).
**Symptom:** UI claims "$0.10" regardless of chain or congestion. Untrue on
Base mainnet, untrue on any network in a busy block.
**Fix:** either remove the line, or compute via `useEstimateGas` ×
`useFeeData()` and convert to USD via a price feed.

### 9. OTC token decimals fallback to 18 (race in `useReadContract`)
**Where:** `invest/[slug]/page.tsx:202`:
```ts
const otcTokenDecimals = typeof otcDecimals === "number" ? otcDecimals : 18;
```
**Symptom:** During the brief moment before the on-chain `decimals()` read
resolves, the UI computes `parseUnits(amount, 18)` — wildly wrong for the
6-decimal cOTCCOM. If a user clicks fast, they could approve / buy a value
that's 10¹² off.
**Fix:** disable the Continue / Approve / Confirm buttons until `otcDecimals`
has resolved. Or treat `undefined` decimals as a loading state, not "default 18".

### 10. OTC token symbol fallback `"cOTC"`
**Where:** `invest/[slug]/page.tsx:203`.
**Symptom:** Brief flash of `cOTC` text before the real symbol loads.
Cosmetic only.
**Fix:** show a `…` placeholder, or block render until the symbol read
resolves.

### 11. "OTC & Bank Transfer" tile uses `window.history.back()`
**Where:** `invest/[slug]/page.tsx:621-627`.
**Symptom:** User clicks "OTC & Bank Transfer" expecting forward navigation,
sees an Info card whose only action button calls `window.history.back()` —
which goes back to wherever the user came from before the invest page (could
be anywhere). Confusing.
**Fix:** navigate to `/project/{slug}#otc` (the OTC tab on the project page).

### 12. `STEPS` constant inconsistent with `InvestStep` type
**Where:** `invest/[slug]/page.tsx:61`:
```ts
const STEPS = ["amount", "approve", "confirm"] as const;
```
…but the actual flow has 4 states: `amount → approve → confirm → success`,
matching the `InvestStep` type from `InvestFlow.tsx`. The success state is
rendered separately and the progress bar uses only the first three. Cosmetic.
**Fix:** include `success` in `STEPS` (or document that the bar
intentionally hides at success), or rename to `STEPS_BAR` to make intent
explicit.

### 13. Test investor wallet has 0.01 ETH — barely enough for repeated runs
**Where:** Operational, not UI. Investor wallet `0x5c5C4A...` is at 0.0099 ETH
on Base Sepolia. Each on-chain test costs ~0.0001 ETH.
**Fix:** add a `scripts/topup-test-wallet.ts` that auto-funds the test investor
from the admin wallet whenever balance drops below threshold. Run as part of
the CI / e2e setup.

---

## Implementation order

Bundle the fixes into a single PR in this order — each is small, all touch
the same 2-3 files, and the order respects dependencies.

| # | Gap | Effort | Status |
| --- | --- | --- | --- |
| 2 | Custom-error selector map → `parseRevertReason` | S | ✅ — extracted into `lib/contracts/revertReasons.ts` with all 28 Sale + 1 OTC selectors |
| 1 | Tokens-allocated formatter (Transactions tab) + sanity check on confirm | S | ✅ — `formatTokenDisplay` in `lib/utils.ts`, used in project Transactions tab and `/portfolio/transactions` |
| 6 | Read `totalContributed[wallet]`, display + disable Continue | S | ✅ — `useReadContract(totalContributed)` in invest page, passed to `InvestAmountStep` as `userTotalContributed` |
| 4 | `useBalance` + low-gas warning banner | S | ✅ — `useBalance` in invest page, `LowGasWarning` component in `InvestFlow.tsx` |
| 3 | Read `maxPerBlock`, show on amount step, validate | S | ✅ — `useReadContract(maxPerBlock)`, displayed inline, validated in `InvestAmountStep` and OTC token amount step |
| 5 | Disabled "Contact issuer" tile when OTC balance is 0 | XS | ✅ — renders as a disabled tile with `mailto:otc@cireta.com` when `saleHasOtcToken && !hasOtcBalance` |
| 7 | `ComplianceAcknowledgment` shared component, used in both approve steps | S | ✅ — extracted, used in `InvestApproveStep` and the OTC token approve step |
| 9 | Disable buttons until `otcDecimals` settles | XS | ✅ — `otcMetadataReady` flag gates Continue/Approve/Confirm in OTC flow |
| 10 | Symbol placeholder until read resolves | XS | ✅ — fallback changed from `"cOTC"` to `"…"` while loading |
| 8 | Remove "$0.10" hardcoded fee | XS | ✅ — replaced with "Network fee paid in ETH from your wallet. Estimated by your wallet at signing time." |
| 11 | OTC & Bank tile → `/project/{slug}#otc` | XS | ✅ — replaced `window.history.back()` with a Next.js `<Link>` to `/project/{slug}#otc` |
| 12 | `STEPS` constant naming / extension | XS | ✅ — renamed to `STEPS_BAR` to make intent (progress-bar-only) explicit |
| 13 | Test wallet topup script | M (separate PR) | ⏳ Not done — operational task, needs `scripts/topup-test-wallet.ts` |

### Files touched

- `apps/launchpad/src/lib/utils.ts` — `formatTokenDisplay`
- `apps/launchpad/src/lib/contracts/revertReasons.ts` — **new** — error selector map + parser
- `apps/launchpad/src/components/organisms/InvestFlow.tsx` — `ComplianceAcknowledgment`, `LowGasWarning`, extended `InvestAmountStep` props, refactored `InvestApproveStep` to use the shared compliance component, removed hardcoded `$0.10`
- `apps/launchpad/src/app/invest/[slug]/page.tsx` — `useBalance`, `useReadContract(maxPerBlock)`, `useReadContract(totalContributed)`, OTC metadata-ready gate, disabled "contact issuer" tile, OTC compliance checkbox, navigation fix, `STEPS_BAR` rename, dropped local `parseRevertReason` in favour of the shared one
- `apps/launchpad/src/app/project/[slug]/page.tsx` — `formatTokenDisplay` for token amounts
- `apps/launchpad/src/app/portfolio/transactions/page.tsx` — `formatTokenDisplay` for token amounts
