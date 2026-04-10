# Buy Flow — USDC & OTC Token

End-to-end reference for the two on-chain purchase paths on the Cireta Launchpad:
**USDC** (regular ERC-20 payment) and **OTC** (`IssuerOTCToken`, an off-platform
"voucher" token issued by the project's issuer).

Last reviewed: 2026-04-10 against commit `d00aa76` on `staging`.

---

## 1. High-level

Both flows end in the same place: a row in the `contributions` table with `status='confirmed'`,
a real on-chain `tx_hash`, and either `is_otc=false` (USDC) or `is_otc=true` (OTC).

```
┌─ UI ─────────────────┐    ┌─ Sale.sol ──────────┐    ┌─ Backend ──────────────┐
│ /invest/[slug]       │    │  buy(phaseId, amt)  │    │ POST /sales/{id}/      │
│  step machine:       │ →  │  buyOTC(phaseId,    │ →  │      contribute        │
│  amount → approve    │    │          amt)       │    │ verifies tx + Purchase │
│  → confirm → success │    │  emits Purchase     │    │ event, writes row      │
└──────────────────────┘    └─────────────────────┘    └────────────────────────┘
```

The frontend always submits one tx (or two if approve is needed), waits for the
receipt with `useWaitForTransactionReceipt`, then `POST`s the tx hash to the API.
The backend re-reads the receipt, parses the `Purchase` event, and writes a
`Contribution` row keyed by `tx_hash` (uniqueness constraint dedupes retries).

The two flows share infrastructure but differ in the payment token, the
contract function called, and the identity-registry surface area they touch.

---

## 2. USDC (regular) flow

### 2.1 UI

**Page:** `apps/launchpad/src/app/invest/[slug]/page.tsx`
**Component:** `apps/launchpad/src/components/organisms/InvestFlow.tsx`

**Step machine:** `amount → approve → confirm → success`. The `approve` step is
automatically skipped when the existing allowance already covers the amount.

| Step      | What runs                                                                                  |
| --------- | ------------------------------------------------------------------------------------------ |
| `amount`  | User enters USDC amount; UI validates against phase `min_contribution` and `max_contribution`. On Continue, refetches allowance. |
| `approve` | `writeApprove({ address: usdc, fn: 'approve', args: [sale, parseUnits(amount, 6)] })`. Skipped if `existingAllowance >= amount`. |
| `confirm` | `writeContribute({ address: sale, fn: 'buy', args: [BigInt(activePhaseIndex), parseUnits(amount, 6)], gas: 500_000n })` |
| `success` | After receipt, `POST /api/v1/sales/{saleId}/contribute` with `{phase_id, amount, tx_hash}`. Renders Basescan link. |

**Key wagmi hooks** (in `invest/[slug]/page.tsx`):
- `useReadContract` for `usdc.allowance(owner, sale)` — drives the skip-approve decision (`hasEnoughAllowance` at line 110).
- `useWriteContract` × 2 — one for `approve`, one for `buy`.
- `useWaitForTransactionReceipt` × 2 — wait for each tx to confirm.
- After `contributeConfirmed` fires, `useEffect` (lines 261-276) calls
  `buy(saleId, { phase_id, amount, tx_hash })` which hits the backend.

**Active phase resolution** (lines 318-333): the UI picks the phase whose
`[start_time, end_time)` window contains "now". The 0-based index of that
phase in the `phases` array is what gets passed to `Sale.buy()`.

**Decimals:** Hardcoded to 6 throughout the USDC path (`parseUnits(amount, 6)`).

### 2.2 On-chain — `Sale.buy(uint256 phaseId, uint256 amount)`

`contracts/src/sale/Sale.sol:389-431`. Checks (in order):

1. `phaseId < phases.length` — `InvalidPhase`
2. `block.timestamp` within `[phase.startTime, phase.endTime]` — `PhaseNotStarted` / `PhaseEnded`
3. First-time buyer must clear `phase.minContribution` — `BelowMinContribution`
4. Cumulative `totalContributed[msg.sender] <= phase.maxContribution` (if non-zero) — `ExceedsMaxContribution`
5. `totalRaised + amount <= hardCap` — `ExceedsHardCap`
6. `_blockContributions[block.number] + amount <= maxPerBlock` — `ExceedsBlockLimit` ⚠️
7. `identityRegistry.isVerified(msg.sender)` — `KYCRequired`
8. If `phase.whitelistOnly`, msg.sender is in `whitelisted[phaseId]` — `NotWhitelisted`
9. If `saleStructure == PhaseAllocated`, `phase.sold + tokens <= phase.allocation` — `ExceedsAllocation`

Effects:
- `tokensToAllocate = (amount * 1e18) / phase.pricePerToken`
- Updates phase / sale / per-address counters
- `paymentToken.safeTransferFrom(buyer, sale, amount)` — pulls USDC
- If `saleMode == Direct`: `IERC20(token).safeTransfer(buyer, tokens)` and mark claimed
- If `saleMode == Vested`: mints `fractionToken` to buyer + `vault.recordAllocation(...)` for vesting
- Auto-finalizes if `totalRaised >= hardCap`
- Emits `Purchase(buyer, phaseId, amount, tokensAllocated, false)` ← `isOTC=false`

### 2.3 Backend recording

Endpoint: `POST /api/v1/sales/{sale_id}/contribute`
Handler: `apps/api/api/v1/endpoints/sales.py:450`
Service: `apps/api/services/sale_contribute_service.py:27` `SaleContributeService.contribute()`

1. Loads user, sale, active phase from DB.
2. Dedupe on `tx_hash` (unique index on `contributions.tx_hash`).
3. `_verify_on_chain(tx_hash, user)`:
   - Calls `Web3SaleService.record_on_chain_contribution(tx_hash)` which:
     - Fetches receipt (status must be `1`)
     - Parses the `Purchase` event from the sale contract ABI
     - Returns `{buyer, phase_id, amount, tokens_allocated, is_otc, sale_address, block_number}`
   - Asserts the buyer wallet matches one of the user's wallets.
4. Min/max/cumulative checks against the phase config.
5. Builds `Contribution`:
   - `amount` and `tokens_allocated` come from the event (source of truth)
   - `wallet_address` from the event buyer field
   - `status = CONFIRMED` (because on-chain data is present)
   - `is_otc = True` only if `on_chain_data["is_otc"]` is truthy → `False` for `buy()`
6. Hard-cap check, then commit. On `IntegrityError` (race), returns the existing row.

The same endpoint serves both flows — there is no separate "/contribute-otc" endpoint.

---

## 3. OTC token flow

The OTC flow lets an issuer collect payment **off-platform** (bank transfer,
private deal, etc.), then mint a 1:1 redeemable voucher token (`IssuerOTCToken`)
to the investor's wallet. The investor walks the same UI flow but pays in
OTC tokens. The sale contract burns those vouchers on receipt. This creates a
real on-chain `Purchase` event with `isOTC=true`, fully auditable.

**Two modes coexist:**
- **On-chain OTC** (this section) — the production flow. Real contract call, `is_otc=true` from event.
- **Manual/off-chain OTC** — `POST /api/v1/sales/{id}/otc` (issuer-only endpoint) writes a contribution
  row directly with `tx_hash="otc-{sale_id}-{wallet}-{ts}"` and `amount=0`. No on-chain side effects.
  Used for legacy / pre-launch allocations and clearly marked "Off-platform" in the UI.

### 3.1 OTC token contract — `IssuerOTCToken`

`contracts/src/otc/IssuerOTCToken.sol`. UUPS-upgradeable ERC-20 with:

- 6 decimals (matches USDC for clean math).
- `MINTER_ROLE` granted to `issuerWallet` at init. Only `MINTER_ROLE` can call `mint()`.
- `burn(from, amount)` is **public** — but if `from != msg.sender` it spends an ERC-20 allowance,
  so the sale contract must hold an allowance OR be `from`. The Sale calls `burn(address(this), ...)` after pulling tokens to itself.
- **Identity gating in `_update`** (line 92-102):
  ```solidity
  function _update(address from, address to, uint256 amount) internal override {
      if (from != address(0) && to != address(0)) {
          if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
      }
      super._update(from, to, amount);
  }
  ```
  Mint (`from == 0`) and burn (`to == 0`) skip the check. Every other transfer
  — including `safeTransferFrom(investor → sale)` during `buyOTC` — requires the
  **recipient** to be on the identity registry. **This is the critical pre-flight
  step that's easy to miss.**

### 3.2 Identity registry pre-flight (CRITICAL)

For `buyOTC` to succeed, **two** addresses must be whitelisted on the OTC token's
identity registry:

| Address | Why | When | Who |
| --- | --- | --- | --- |
| **Investor wallet** | OTC token's `_update` blocks unverified recipients, so the issuer's `mint(investor, …)` reverts unless investor is whitelisted. | At investor KYC approval. | Backend `SimpleIdentityBridgeService` auto-registers verified users (already wired). |
| **Sale contract address** | `safeTransferFrom(investor, sale, amount)` inside `buyOTC` triggers `_update(investor, sale, ...)` which checks `isVerified(sale)`. | After sale deploy, before first `buyOTC`. | **Currently manual.** Must be done by an account with `REGISTRAR_ROLE` on the OTC token's identity registry. |

> ⚠️ **There is no automation for whitelisting the sale contract on the OTC identity registry.**
> This was discovered while testing the on-chain OTC flow on Base Sepolia
> (sale `0x596EE38B…`, OTC token `0x5c5bA466…`, registry `0xD4Bb5730…`).
> The `IDENTITY_SIGNER_PRIVATE_KEY` from `.env` holds `REGISTRAR_ROLE` and was
> used to call `addToWhitelist(saleAddress, 0)`. Tracking issue: see
> *Known gaps* below.

`SimpleIdentityRegistry.addToWhitelist(address wallet, uint16 country)` is
restricted to `REGISTRAR_ROLE` (or legacy `agent`). On Base Sepolia, the
identity signer wallet `0xd1C9a9EF…` has the role. To whitelist on prod, the
production identity signer needs `REGISTRAR_ROLE` on the production registry —
**this is part of deployment hand-off, not runtime**.

### 3.3 Issuer mints OTC vouchers

Issuer calls `IssuerOTCToken.mint(investor, amount)` from a wallet holding
`MINTER_ROLE`. With 6 decimals, "100,000 tokens" is `100_000_000_000` raw.
This emits `OTCMinted(investor, amount)` and increases the investor balance.

**Issuer surface today:** the contract function exists and is gated correctly.
There is **no admin-UI page yet** to drive the mint — issuers either use the
admin interface's contract-write helpers, or mint via a script (like `scripts/`).
Adding an "OTC issuance" page to `apps/admin` is a follow-up.

### 3.4 UI — `/invest/[slug]` OTC branch

Same page as USDC but a different code path.

**Discovery / gating:**
- Reads `Sale.otcToken()` (line 165). If non-zero, OTC is enabled.
- Reads OTC token `balanceOf(connectedAddress)`, `decimals()`, `symbol()`,
  `allowance(owner, sale)` (lines 178-216).
- The "OTC Token" payment method radio is shown only if `otcBalanceFormatted > 0`
  AND `saleOtcEnabled` is true (read from the DB sale row).

**Step machine:** identical 4-step flow, with OTC-specific handlers.

| Step      | OTC handler                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| `amount`  | Validates against the same phase min/max. On Continue, refetches `otcAllowance`. Skips approve if sufficient. |
| `approve` | `writeOtcApprove({ address: otcToken, fn: 'approve', args: [sale, parseUnits(amount, otcDecimals)] })` |
| `confirm` | `writeBuyOtc({ address: sale, fn: 'buyOTC', args: [BigInt(activePhaseIndex), parseUnits(amount, otcDecimals)], gas: 500_000n })` |
| `success` | `POST /sales/{id}/contribute` with the buyOTC tx hash. Same endpoint as USDC. |

**Decimals:** dynamic via `otcTokenDecimals = useReadContract(decimals)`,
defaulting to 18 if the read hasn't resolved (line 202). Currently the live
OTC token uses 6 decimals.

### 3.5 On-chain — `Sale.buyOTC(uint256 phaseId, uint256 amount)`

`contracts/src/sale/Sale.sol:435-485`. Checks are the same as `buy()`, plus:

- `address(otcToken) != 0` — `OTCNotEnabled`
- `IERC20(otcToken).balanceOf(msg.sender) >= amount` — `"insufficient OTC token balance"`
- `IERC20(otcToken).allowance(msg.sender, sale) >= amount` — `"OTC token not approved"`
- `tokensToAllocate > 0` — `"amount too small for token allocation"`

Effects:
- `tokensToAllocate = (amount * 1e18) / phase.pricePerToken` (same formula as USDC)
- Updates phase / sale counters; **bumps `totalRaised` and `totalOtcAllocated`**
- `contributions[msg.sender].isOtc = true`
- `IERC20(otcToken).safeTransferFrom(msg.sender, sale, amount)` ← **this is where the identity gate fires**
- `otcToken.burn(address(this), amount)` ← burns the vouchers (skip identity check, `to=0`)
- Same Direct vs Vested branch as `buy()`
- Emits `Purchase(buyer, phaseId, amount, tokensAllocated, true)` ← **`isOTC=true`**

### 3.6 Backend recording (OTC)

Identical code path. `Web3SaleService.record_on_chain_contribution` reads the
5th field of the `Purchase` event (`isOTC`) and exposes it as `is_otc`.
`SaleContributeService.contribute` sets `contribution.is_otc = True` if the
event flagged it.

This was a recent fix in commit `d00aa76`:
- `apps/api/services/web3_sale_service.py:209` — return `is_otc` from the event.
- `apps/api/services/sale_contribute_service.py:266` — propagate it to the row.
- `apps/api/api/v1/endpoints/portfolio.py` — surface it in the `/portfolio/transactions` response.
- `apps/launchpad/src/app/project/[slug]/page.tsx` — render the "OTC Buy" badge using `tx.is_otc`.

---

## 4. `maxPerBlock` and the split-tx pattern

`Sale.maxPerBlock` is a per-block soft DoS / flash-loan guard. On the Wassa Gold
Sepolia sale it's `50_000_000 * 1e6` = 50,000,000 cUSDC per block. Both `buy`
and `buyOTC` enforce it.

**Implication for large purchases:** A single transaction larger than
`maxPerBlock` reverts with `ExceedsBlockLimit()` (selector `0x38ad1bbd`).
To buy more than the limit, split into N transactions across N different blocks
(Base Sepolia ~2s per block, so just send sequentially).

**The UI does not yet display this limit.** Users see only the phase
`min_contribution` / `max_contribution`. This is a UX gap; cf. *Known gaps*.

---

## 5. End-to-end dry run (verification, 2026-04-10)

All performed against Base Sepolia (chain `84532`), sale
`0x596EE38B2E7a18097B73C0595A6379974eA1Cba8`, investor
`0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba`, phase 0 ("Seed", unlimited
`maxContribution`). Explorer: `https://sepolia.basescan.org`.

### 5.1 USDC dry run

| Step | Tx hash | Block | Result |
| --- | --- | --- | --- |
| Pre-existing (UI buy) | `0xab1e168a…2f102a` | 40023489 | 85,000 cUSDC, 1.0 token, `is_otc=false` |
| Script buy (mirrors UI) | `0x9b6fb4def…9db243` | 40013474 | 100,000 cUSDC, `is_otc=false` |

Both verified by:
1. `eth_getTransactionByHash` → input `0xd6febde8` (= `buy(uint256,uint256)`)
2. Backend `POST /contribute` returned 200 with the parsed event data.
3. Row in `contributions` shows `status='confirmed'`, correct `tx_hash`, `is_otc=false`.

### 5.2 OTC dry run

Pre-flight (one-time setup, normally a deployment task):

| Step | Tx hash / Result |
| --- | --- |
| Whitelist sale on OTC identity registry | `0xc4c41408…7a07851` (`addToWhitelist(0x596EE38B…, 0)` from `0xd1C9a9EF…` w/ `REGISTRAR_ROLE`) |
| Issuer mints 100,000,000 cOTCCOM to investor | `0x596ccc61…05aa2` (issuer `0x759948…` w/ `MINTER_ROLE`) |
| Investor approves sale to spend 100,000,000 cOTCCOM | `0x5f41466c…cb9ff137` |

Buy (split across 2 blocks because `maxPerBlock = 50M`):

| Step | Tx hash | Block | Amount | Result |
| --- | --- | --- | --- | --- |
| `buyOTC(0, 49,999,999_000000)` | `0x1a3fafac…a45e` | 40013916 | ~50M cOTCCOM | `Purchase(...,true)`, `is_otc=true` |
| `buyOTC(0, 49,999,999_000000)` | `0x9b3d4cc2…0fbe7` | 40013919 | ~50M cOTCCOM | `Purchase(...,true)`, `is_otc=true` |

Both verified by:
1. `eth_getTransactionByHash` → input starts with the `buyOTC` selector
2. Backend `POST /contribute` returned 200 with `is_otc=true` on each
3. Rows in `contributions` show `is_otc=true` and the real on-chain hashes
4. UI Transactions tab on `/project/wassa-gold-token` renders both as "OTC Buy"
   amber badges with Sepolia Basescan tx links

> **Why we picked phase 0 not phase 1:** the previous USDC test hit phase 1
> ("Seed Round") which has `maxContribution = 85,000`, already consumed by the
> earlier 85k buy. Phase 0 ("Seed") has `maxContribution = 0` (unlimited).
> The frontend's `activePhaseIndex` resolver is time-based, so when running the
> UI manually you'll naturally hit whichever phase is currently active.

---

## 6. Configuration / explorer URLs

The frontend uses `getTxUrl(chainId, txHash)` from
`apps/launchpad/src/lib/contracts/addresses.ts`. The mapping is:

| chainId | Explorer base |
| --- | --- |
| `84532` (Base Sepolia) | `https://sepolia.basescan.org` |
| `8453` (Base mainnet) | `https://basescan.org` |
| `11155111` (Ethereum Sepolia) | `https://sepolia.etherscan.io` |

Both dev and staging are on Base Sepolia (`84532`), so all transaction
links resolve to `https://sepolia.basescan.org/tx/...`. As of commit
`<this commit>`, the project Transactions tab, the standalone
`/portfolio/transactions` page, and the `InvestSuccessStep` all use
`getTxUrl(chainId, …)` instead of hardcoded mainnet links.

---

## 7. Database shape

`contributions` (relevant columns):

| Column | Source for USDC | Source for on-chain OTC | Source for off-platform OTC |
| --- | --- | --- | --- |
| `user_id` | JWT subject | JWT subject | resolved from `wallets.address` lookup or issuer fallback |
| `sale_id` | URL param | URL param | URL param |
| `phase_id` | active phase at API time | active phase at API time | first phase by `phase_number` |
| `amount` | from `Purchase.amount` (USDC, 6 dec) | from `Purchase.amount` (OTC token's units) | `0` |
| `tokens_allocated` | from `Purchase.tokensAllocated` | from `Purchase.tokensAllocated` | `request.token_amount` |
| `tx_hash` | real on-chain hash | real on-chain hash | `otc-{sale_id}-{wallet[:8]}-{ts}` |
| `status` | `confirmed` | `confirmed` | `confirmed` |
| `is_otc` | `false` | **`true`** (from `Purchase` event 5th field) | **`true`** (set explicitly in `otc_allocate`) |
| `wallet_address` | from event buyer | from event buyer | `request.investor_wallet` |
| `claim_tx_hash` | set later when investor claims | set later when investor claims | n/a |

The `tx_hash` column has a unique index, so the same on-chain hash cannot be
recorded twice. Off-platform OTC hashes are intentionally non-overlapping with
real tx hashes (they begin with `otc-`).

---

## 8. Known gaps

These are **not blockers** for the dry run but should be tracked:

1. **No automation to whitelist the sale contract on the OTC identity registry.**
   Today this is a manual `addToWhitelist(sale, 0)` call. It belongs in the sale
   deployment pipeline (after the sale address is known, before activation).
   Without it, the very first `buyOTC` reverts with `RecipientNotVerified(sale)`
   selector `0xa3e9d91e` — opaque to a normal user.

2. **No admin UI to mint OTC vouchers.** Issuers currently call
   `IssuerOTCToken.mint` directly. An "OTC Issuance" page in `apps/admin` would
   close the loop (input investor wallet + amount + payment reference, sign with
   the issuer's connected wallet).

3. **`maxPerBlock` is invisible to users.** Buys above the limit revert with a
   selector-only error. The UI should at least surface the limit during the
   amount step, ideally as an inline cap (`min(phase.max, maxPerBlock - this_block_total)`).

4. **OTC token `decimals` defaults to 18 in the UI when the read hasn't settled.**
   The current cOTCCOM is 6 decimals so this only matters during the brief
   first paint. Worth a guard rail before issuers ship a non-6-decimal OTC token.

5. **OTC token symbol fallback is `cOTC`** (rendered before the on-chain read
   resolves). Cosmetic.

6. **Backend doesn't enforce the `maxPerBlock` limit ahead of the on-chain
   call.** The contract revert is the only line of defense. A pre-flight check
   in `SaleContributeService` would let the UI fail faster with a friendly
   error.

---

## 9. Quick reference — where things live

| What | Where |
| --- | --- |
| Invest page (state, hooks, handlers) | `apps/launchpad/src/app/invest/[slug]/page.tsx` |
| Step-component primitives (`InvestAmountStep`, `InvestApproveStep`, `InvestConfirmStep`, `InvestSuccessStep`) | `apps/launchpad/src/components/organisms/InvestFlow.tsx` |
| Project page Transactions tab | `apps/launchpad/src/app/project/[slug]/page.tsx` (the `activeTab === "Transactions"` block) |
| Standalone Transactions page | `apps/launchpad/src/app/portfolio/transactions/page.tsx` |
| `getTxUrl` / `getExplorerUrl` | `apps/launchpad/src/lib/contracts/addresses.ts` |
| Sale contract | `contracts/src/sale/Sale.sol` |
| OTC token contract | `contracts/src/otc/IssuerOTCToken.sol` |
| Identity registry | `contracts/src/identity/SimpleIdentityRegistry.sol` |
| `SaleContributeService` | `apps/api/services/sale_contribute_service.py` |
| `Web3SaleService` (event parsing) | `apps/api/services/web3_sale_service.py` |
| Contribute endpoint | `apps/api/api/v1/endpoints/sales.py` (`POST /sales/{id}/contribute`) |
| Manual OTC allocation endpoint | `apps/api/api/v1/endpoints/sales.py` (`POST /sales/{id}/otc`) |
| `/portfolio/transactions` API | `apps/api/api/v1/endpoints/portfolio.py` (`get_transactions`) |
| Identity bridge service (auto-whitelist users) | `apps/api/services/simple_identity_bridge_service.py` |
