# Contract Validation Audit

Comprehensive audit of constraint enforcement across the Cireta sale contracts.
For each contract function, lists what is currently enforced and what should
be added. Companion to [`INVEST_FLOW_GAPS_ROUND_3.md`](./INVEST_FLOW_GAPS_ROUND_3.md)
which catalogues UI gaps; this doc focuses on the on-chain layer.

Reviewed: 2026-04-10 against commit `4c40d22` on `staging`.

> **Context:** still in development phase on Base Sepolia. Contract changes
> can be breaking — no migration burden, no upgrade-safety constraints.
> The flow is: change contracts → redeploy → roll fresh test sales.

---

## Sale.sol

### `initialize()`

✅ **Enforced:**
- All critical addresses non-zero: `_token`, `_paymentToken`, `_identityRegistry`, `_issuer`, `_factory`, `_feeManager`
- OTC token may be zero (optional)
- Default `maxPerBlock = 50,000 USDC`

❌ **Missing:**
- `softCap > 0`
- `hardCap > 0`
- `softCap <= hardCap`
- `feeBasisPoints <= 1000` (i.e. ≤ 10 %, sanity ceiling)
- **No sale-level `startTime` / `endTime`** — only per-phase windows. Phases have nothing to validate against. **The user's primary ask: phases must fall inside the sale window. Add `saleStartTime`/`saleEndTime` storage + init params.**

### `addPhase()`

✅ **Enforced:**
- Status must be `Draft` or `Active`
- `minContribution > 0` (added in commit `4c40d22`)

❌ **Missing:**
- `pricePerToken > 0`
- `phase.startTime < phase.endTime`
- **`phase.startTime >= sale.startTime`**
- **`phase.endTime <= sale.endTime`**
- `phase.startTime > block.timestamp` (can't add a phase already in the past)
- `maxContribution == 0 || maxContribution >= minContribution` (currently can be inverted)
- For `PhaseAllocated` structure: `allocation > 0`
- For `PhaseAllocated` structure: sum of allocations across phases ≤ `hardCap`

### `buy()` / `buyOTC()`

✅ **Enforced** (from `Sale.sol:389-485`):
- Phase id bounds, time window, KYC, whitelist, hard cap, block limit, min/max contribution, OTC balance + allowance, OTC token enabled.

❌ **Missing:**
- Decimals normalization assumption (paymentToken=6, projectToken=18) is implicit, not enforced.
- For `buyOTC`: requires the sale contract to be whitelisted on the OTC identity registry, but no on-chain hint of this — already documented as a deploy-pipeline gap.

### `setMaxPerBlock()`

✅ Enforced: `_maxPerBlock != 0`.

❌ Missing: practical floor (e.g. `>= 1e6`) to prevent setting it to 1 wei and defeating the anti-flash-loan purpose.

### `setVestedMode()`

✅ Enforced: vault and fractionToken non-zero, `Draft` status only.

❌ Missing: doesn't validate vault's vesting durations (cliff < vesting). Vault's own init validates that — see below.

### `_finalize()`

✅ Enforced: soft-cap branching, fee cap.

❌ Missing:
- For vested sales, doesn't check the vault has tokens before starting vesting. If the issuer forgets to deposit, investors get fractions backed by an empty vault.

---

## CiretaVault.sol

### `initialize()`

✅ Enforced: `_projectToken`, `_issuer` non-zero (fractionToken can be zero for two-step init).

❌ Missing:
- `cliffDuration < vestingDuration`
- `vestingDuration > 0`

### `recordAllocation()`

✅ Enforced: `onlySale` modifier.

❌ Missing:
- No re-verification that the recipient is on the identity registry. The Sale already checks, but defense in depth would be cheap.
- No global cap check — vault doesn't know the sale hardCap. (Sale handles this; trust boundary OK.)

### `claim()`

✅ Enforced: vault must be finalized, claimable > 0, fractions burned before transfer (CEI).

❌ Missing: relies on `_calculateVested` math to match outstanding fraction supply; no defense-in-depth check.

### `withdrawExcess()`

✅ Enforced: only issuer, finalized, can't underflow outstanding fractions.

❌ Missing: doesn't require all investors to have claimed first. Probably intentional; document.

---

## CiretaFractionToken.sol

✅ Enforced:
- `MINTER_ROLE` for mint, `BURNER_ROLE` for burn
- `_update()` requires both ends verified for peer transfers (zero address skipped)

❌ Missing:
- No validation that `decimals_` matches the underlying project token
- `mint`/`burn` don't require `amount > 0`
- Roles aren't granted in `initialize()` — must be granted post-deploy by the factory. Easy to forget.

---

## IssuerOTCToken.sol

✅ Enforced:
- `MINTER_ROLE` gated mint
- `_update()` recipient verification (mint/burn skipped)
- 6 decimals (hardcoded to match USDC)

❌ Missing:
- No `amount > 0` check on `mint`
- Sender of OTC transfers isn't checked, only recipient — asymmetric gating. Probably intentional (issuer mints to unverified, they must KYC before transferring) but worth a comment.
- The sale contract must be whitelisted on the OTC identity registry for `buyOTC` to succeed, but nothing in this contract enforces or hints at it. Tracked as deploy-pipeline gap #11.

---

## SimpleIdentityRegistry.sol

✅ Enforced:
- `wallet != 0` in `addToWhitelist`
- `REGISTRAR_ROLE` / `AGENT_ROLE` gating
- Idempotent add/remove (doesn't double-emit)

❌ Missing:
- No country-code allowlist (any uint16 accepted)
- No cascading action when removing a wallet (existing fraction / OTC token holdings stay liquid)
- No expiration / re-verification cadence
- No rate limit on `batchAddToWhitelist`

---

## CiretaSaleFactory.sol

✅ Enforced: only active issuers can deploy, post-deploy verification of issuer / factory / fee.

❌ Missing:
- Doesn't validate the encoded `initData` itself — caps, fee bps, vesting durations all flow through opaquely. The new validation in `Sale.initialize()` will catch most of it, but the factory could pre-validate and fail faster.
- Doesn't require the issuer to be KYC-verified themselves before deploying.

---

## Priority fix list

### High — shipped this commit

| # | Fix | Where | Selector / Status |
|---|---|---|---|
| A | Sale window storage + init params; phases must fit inside | `Sale.sol` `initialize` + `addPhase` | `0x6f9a354b` `PhaseOutsideSaleWindow`, `0x5e977042` `InvalidSaleWindow` ✅ |
| B | `softCap > 0`, `hardCap > 0`, `softCap <= hardCap` | `Sale.initialize` | `0x5c9e11e8` `InvalidCaps` ✅ |
| C | `feeBasisPoints <= 1000` (10 % ceiling) | `Sale.initialize` | `0x8bff87cf` `InvalidFeeBps` ✅ |
| D | `pricePerToken > 0` | `Sale.addPhase` | `0x6e610074` `ZeroPricePerToken` ✅ |
| E | `phase.startTime < phase.endTime` | `Sale.addPhase` | `0x09343c3e` `InvalidPhaseTimeRange` ✅ |
| F | Phase end time must be in the future | `Sale.addPhase` | `0x56c3964d` `PhaseInPast` ✅ |
| G | `maxContribution == 0 \|\| maxContribution >= minContribution` | `Sale.addPhase` | `0x205be542` `InvalidContributionRange` ✅ |
| H | For `PhaseAllocated`: `allocation > 0` | `Sale.addPhase` | `0xe25a5543` `ZeroPhaseAllocation` ✅ |
| I | For `PhaseAllocated`: cumulative allocation ≤ `hardCap` | `Sale.addPhase` (new `totalPhaseAllocation` storage) | `0x646bd99d` `PhaseAllocationExceedsHardCap` ✅ |
| J | `cliffDuration < vestingDuration && vestingDuration > 0` | `CiretaVault.initialize` | `0x5c9504c2` `InvalidVestingConfig` ✅ |
| K | Mirror all the above | Pydantic + admin form + launchpad revertReasons | ✅ |
| L | Sale window plumbed end-to-end | `web3_sale_service` + `endpoints/sales.py deploy_sale` derive window from DB phases | ✅ |
| M | Test scripts updated for the new initialize signature | `e2e-full-test.ts`, `e2e-smoke-test.ts`, `debug-vested.ts`, `simulate-vested.ts` | ✅ |

### Breaking change

`Sale.initialize` signature gained two new params (`uint256 _saleStartTime,
uint256 _saleEndTime`). The factory passes initData opaquely so the factory
itself didn't need a change, but every caller that builds initData (backend
`web3_sale_service.deploy_sale*`, the four test scripts above) was updated.

`Sale.sol` storage layout added 3 new slots (`saleStartTime`, `saleEndTime`,
`totalPhaseAllocation`) with the storage gap shrunk from 46 → 43 to keep
the upgrade-safety footprint constant. **However, this is a one-way change
for any deployed proxy** — existing testnet sales must be redeployed.

### Round 2 — shipped

| # | Fix | Where | Selector / Status |
|---|---|---|---|
| N | Vault non-empty check in `_finalize()` for vested sales | `Sale.sol` `_finalize` | `0x...` `VaultEmpty` ✅ |
| O | Issuer must be on the identity registry at sale init | `Sale.sol` `initialize` | `0x...` `IssuerNotVerified` ✅ |
| P | `setMaxPerBlock` floor (≥ 1 USDC = 1e6) | `Sale.sol` `setMaxPerBlock` | `0x...` `MaxPerBlockTooLow` ✅ |
| Q | `mint`/`burnFrom` `amount > 0` on fraction token | `CiretaFractionToken.sol` | `0x...` `ZeroAmount` ✅ |
| R | `mint` `amount > 0` on OTC token | `IssuerOTCToken.sol` | `0x...` `ZeroAmount` ✅ |
| S | All new selectors mapped in launchpad `revertReasons.ts` | `apps/launchpad/src/lib/contracts/revertReasons.ts` | ✅ |

### Deployed (Base Sepolia, 2026-04-10)

Round-4 implementations deployed via `scripts/deploy_round4_impls.py` and
the live factories now point at them. Existing sales already deployed
against the old impls keep running on the old code.

| Contract | New impl address | Tx |
| --- | --- | --- |
| `Sale` | `0xD33f9b093160C124aa7946AE42BDf31183A7f3c9` | `0x362deb4d…2cb2a4cb` |
| `IssuerOTCToken` | `0x928884Aa3C4A62DCac83959D9D4114deEf948fDD` | `0x5d332d33…ee6f9b249` |

Factory pointer updates:

| Factory | Setter call | Tx |
| --- | --- | --- |
| `CiretaSaleFactory` `setSaleImplementation` | → `0xD33f9b09…` | `0x286b0558…dde44614e` |
| `IssuerOTCTokenFactory` `setOTCTokenImplementation` | → `0x928884Aa…` | `0xf4044af6…0a1863d73` |

`contracts/deployments/base-sepolia.json` updated to reflect the new
addresses. Verified via:
```bash
cast call $SALE_FACTORY 'saleImplementation()(address)' --rpc-url base-sepolia
# → 0xD33f9b093160C124aa7946AE42BDf31183A7f3c9
cast call $OTC_FACTORY 'otcTokenImplementation()(address)' --rpc-url base-sepolia
# → 0x928884Aa3C4A62DCac83959D9D4114deEf948fDD
```

#### Not yet deployed: `CiretaVault` + `CiretaFractionToken`

`CiretaFractionFactory` is owned by `CiretaSaleFactory`
(`0xf83CbEf4…`), not by the admin wallet, and the SaleFactory does not
expose pass-through setters. To swap the vault/fraction impls we need
to either:

1. **Upgrade `CiretaSaleFactory`** (it's UUPS-upgradeable) to add
   pass-through setters `setFractionVaultImpl(address)` /
   `setFractionTokenImpl(address)` that internally call
   `fractionFactory.setVaultImplementation(impl)` and
   `fractionFactory.setFractionTokenImplementation(impl)`. Cleanest;
   leaves the security boundary intact.
2. Add a one-shot `setFractionFactoryOwner(address)` to SaleFactory,
   transfer FractionFactory ownership to admin, do the updates, transfer
   back. Less clean but smaller change.

Tracked as a follow-up. Until then, **new sales deployed via
CiretaSaleFactory will use the new Sale impl + the old Vault/Fraction
impls.** That means the new sale-level + phase-level validation works,
but the new `amount > 0` checks on fraction mint/burn and the
`InvalidVestingConfig` check don't apply yet.

### Deploy plan (testnet) — for the next round

The new code requires deploying a fresh **implementation** contract for
each touched contract and pointing the factory(ies) at the new impls.
Existing sales already deployed against the old impl keep running on the
old code — leave them alone. New sales deployed via the factory after
the swap get all the new validation.

Steps:

1. `hardhat run scripts/deploy-sale-impl.ts --network base-sepolia`
   → deploys new `Sale` implementation
2. From the factory owner wallet:
   `CiretaSaleFactory.setSaleImplementation(newImpl)`
3. Same for CiretaVault, CiretaFractionToken (each lives behind its
   own factory), IssuerOTCToken
4. **Do not UUPS-upgrade existing sales.** The new `Sale.sol` has 3 new
   storage slots (`saleStartTime`, `saleEndTime`, `totalPhaseAllocation`)
   that would read as zero in an upgraded existing proxy, breaking
   `addPhase` because `phase.endTime <= 0` always fails.
5. Roll fresh test sales via the admin UI. The backend deploy flow
   already passes the new init params (sale window derived from DB phases),
   so a fresh sale uses all the new validation end-to-end.

### Medium / Low — still tracked

- Factory pre-validates `initData` before deploying (M)
- Identity registry country-code allowlist (L)
- Cascading freeze on identity removal (L, larger scope)
- `setSaleImplementation` deploy script automation (Operational)

### Medium (follow-up)

- Vault non-empty check in `Sale._finalize()` for vested sales
- `mint`/`burn` `amount > 0` checks on fraction + OTC tokens
- Factory pre-validates `initData` before deploying
- Sum-of-phase-allocations ≤ `hardCap` runs across both new and existing phases

### Low (later)

- `setMaxPerBlock` floor sanity check
- Identity registry country-code allowlist
- Cascading freeze on identity removal (significant scope)
- Issuer must be KYC'd before deploying their first sale
