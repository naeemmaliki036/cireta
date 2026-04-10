# Fresh Testnet Deploy Plan

**Status:** Planned, not yet executed.
**Decision date:** 2026-04-10
**Decision:** Option A from the upgradeability discussion — keep contracts UUPS-upgradeable, do a clean fresh deploy of the entire platform on Base Sepolia and abandon all existing test data (Wassa Gold and friends).

This doc is a runbook for when we're ready to execute. Until then, the
existing testnet stays as-is and the round-4 contract impls deployed in
commit `d9101be` are the latest known-good `Sale` + `IssuerOTCToken`.

---

## Why do this

After 4 rounds of contract validation hardening (see
[`CONTRACT_VALIDATION_AUDIT.md`](./CONTRACT_VALIDATION_AUDIT.md)) the
existing testnet state is full of garbage:

- The Wassa Gold sale phase 0 was created with `min = 0` (the bug that
  motivated round 3)
- Phase numbering on the Wassa sale was duplicated (`1, 1, 2`); fixed
  in DB only, not on-chain
- The Wassa sale's contract was deployed with the old `Sale.initialize`
  signature (no `saleStartTime`/`saleEndTime`), so the new round-4
  validation doesn't apply to it
- `CiretaVault` and `CiretaFractionToken` impls on the existing
  `CiretaFractionFactory` are still pre-round-4 (the FractionFactory is
  owned by SaleFactory which has no pass-through setters — see
  `CONTRACT_VALIDATION_AUDIT.md` "Not yet deployed" section)
- Existing OTC tokens, identity registry whitelist entries, deployed
  sales, and issuer records are all entangled with the old impls

Rather than try to migrate all of that, the cleanest move is: drop the
testnet state, deploy everything from scratch with the round-4 code, and
roll fresh test sales.

This is a **testnet-only** operation. Mainnet is a separate decision.

---

## Why we're keeping UUPS

Considered going fully immutable (remove `__gap`, `Initializable`,
`UUPSUpgradeable`, convert `initialize()` → `constructor()`) but
decided against:

1. **Compliance changes will happen.** Cireta is a regulated RWA
   platform. Regulators move the goalposts; we need to push fixes
   without redeploying every sale and migrating every investor.
2. **Bug discovery is inevitable.** A locked, immutable contract that
   holds investor funds is a footgun. UUPS gives us hot-fix capability.
3. **The gap pattern is free.** `uint256[43] private __gap` costs
   nothing at deploy time — empty storage slots aren't written. The
   only "cost" is 3 lines of source per contract.
4. **One-way decision.** Going immutable is irreversible without a
   total redeploy + state migration. Easier to start upgradeable and
   lock down later than the reverse.

Mainnet may be different — the convention there is to either audit the
upgrade machinery thoroughly or transfer upgrade authority to a
long-timelock multisig (or burn the upgrade key entirely). That's a
mainnet-readiness conversation.

---

## What needs to be deployed (in order)

The deploy graph, ordered by dependency:

```
1. SimpleIdentityRegistry           (no deps, UUPS)
2. IssuerRegistry                   (no deps, UUPS)
3. PlatformFeeManager               (no deps)
4. ciretaUSDC mock                  (no deps, ERC20 mock — testnet only)
5. CountryAllowModule + MaxHolderCountModule  (compliance modules)
6. ComplianceImplementation         (UUPS impl)
7. TokenImplementation              (UUPS impl)
8. SaleImplementation               (UUPS impl, round-4 code)
9. VaultImplementation              (UUPS impl, round-4 code)
10. FractionTokenImplementation     (UUPS impl, round-4 code)
11. OTCTokenImplementation          (UUPS impl, round-4 code)
12. TokenFactory                    (proxy, depends on TokenImplementation)
13. FractionFactory                 (proxy, depends on Vault + Fraction impls)
14. SaleFactory                     (proxy, depends on SaleImplementation + FractionFactory)
15. OTCTokenFactory                 (proxy, depends on OTCTokenImplementation)
```

After deploying:

```
16. SaleFactory.setFractionFactory(fractionFactory)
17. FractionFactory.transferOwnership(saleFactory)  [vault deploys via deploySaleVested]
18. SimpleIdentityRegistry — grant REGISTRAR_ROLE to backend signer
                            grant REGISTRAR_ROLE to identity-bridge service wallet
                            grant AGENT_ROLE to admin
19. IssuerRegistry — grant relevant roles
20. Verify each impl on Sourcify / Basescan
```

---

## Env / config updates after deploy

After the deploy, the following addresses change and need to be propagated:

### `.env` (root)

```bash
TOKEN_FACTORY_ADDRESS=<new>
SALE_FACTORY_ADDRESS=<new>
FRACTION_FACTORY_ADDRESS=<new>
# OTC_FACTORY_ADDRESS — currently not in .env, add it
NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=<new>
NEXT_PUBLIC_SALE_FACTORY_ADDRESS=<new>
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=<new>
NEXT_PUBLIC_USDC_ADDRESS=<new ciretaUSDC>
```

### `apps/launchpad/.env.local` and `.env.production`

Same `NEXT_PUBLIC_*` keys as above.

### `apps/admin/.env.local`

Same.

### `contracts/deployments/base-sepolia.json`

Replace **all** addresses. The `deploy_round4_impls.py` script can be
extended to write this file directly so we don't need a manual JSON
update.

### Database

- Wipe the `token_sales`, `sale_phases`, `contributions`, `tokens`,
  `wallets`, `kyc_applications` tables on both dev and staging Railway
  DBs (or just delete the rows referencing the old contracts)
- Re-seed any reference data that doesn't depend on chain state
- Keep `users` table — those are real test accounts

### Railway environment

The staging API and admin services have their own env var sets. Update:
- `SALE_FACTORY_ADDRESS`
- `TOKEN_FACTORY_ADDRESS`
- `FRACTION_FACTORY_ADDRESS`
- `NEXT_PUBLIC_*` equivalents on the launchpad service
- Restart services after env update

---

## Polish to consider while we're at it

While we're rewriting the deploy script anyway, three small refinements
worth bundling in:

### 1. Right-size the storage gaps

Currently `Sale.sol` has `uint256[43] private __gap` (was `[46]`,
shrunk by 3 in round 4 when `saleStartTime` / `saleEndTime` /
`totalPhaseAllocation` were added). Bump to `[100]` (or `[200]`) so
future-us never has to think about gap shrinkage again. Same for
`CiretaVault.sol`, `CiretaFractionToken.sol`, `IssuerOTCToken.sol`.

### 2. Add `version()` constant to every contract

```solidity
function version() external pure returns (string memory) {
    return "4.0.0";
}
```

Lets us verify on-chain which impl is live without grepping addresses.
Useful for the indexer / admin UI / debugging "is this sale running
old or new code".

### 3. Add an `upgradeNonce` slot that increments on `_authorizeUpgrade`

```solidity
uint256 public upgradeNonce;

function _authorizeUpgrade(address) internal override adminOnly {
    upgradeNonce++;
}
```

Lets the indexer / admin UI detect "is this proxy on its original impl
or has it been upgraded since". Tiny addition, real ops value.

### 4. Add the SaleFactory pass-through setters before the deploy

The `CiretaFractionFactory` ownership problem we hit in round 4 can be
solved by adding to `CiretaSaleFactory.sol`:

```solidity
function setFractionVaultImpl(address impl) external onlyOwner {
    fractionFactory.setVaultImplementation(impl);
}
function setFractionTokenImpl(address impl) external onlyOwner {
    fractionFactory.setFractionTokenImplementation(impl);
}
```

If we add these *before* the fresh deploy, future round-N impl swaps
for vault + fraction can be done from the admin wallet without
upgrading the SaleFactory itself.

---

## Execution plan (when we run this)

Rough order of operations on the day of:

1. **Pre-flight**
   - Confirm admin wallet has ≥0.1 ETH on Base Sepolia
   - Confirm `ADMIN_PRIVATE_KEY` is in `.env`
   - Confirm no in-flight test sales on the existing testnet you actually
     want to keep
   - Snapshot the current `contracts/deployments/base-sepolia.json` to a
     `.backup-<date>.json` file

2. **Polish**
   - Bump storage gaps (see #1 above)
   - Add `version()` constant (#2)
   - Add `upgradeNonce` (#3)
   - Add SaleFactory pass-through setters (#4)
   - Recompile contracts: `cd contracts && ./node_modules/.bin/hardhat compile --force`
   - Run any existing contract tests: `./node_modules/.bin/hardhat test`

3. **Deploy script**
   - Extend `scripts/deploy_round4_impls.py` (or write a fresh
     `scripts/deploy_clean_testnet.py`) that walks the dependency
     graph above. Each step prints the deployed address. Final step
     writes the new `contracts/deployments/base-sepolia.json`.
   - Dry-run / static-call where possible

4. **Run the deploy**
   - From the repo root:
     `poetry run python scripts/deploy_clean_testnet.py`
   - Save the output log to `docs/deploy-logs/<date>-base-sepolia.log`

5. **Post-deploy**
   - Update `.env`, `apps/launchpad/.env.local`, `apps/admin/.env.local`
     with new addresses
   - Update Railway env vars on staging API + launchpad
   - Wipe DB tables that reference old chain state
   - Verify each impl on Basescan / Sourcify
   - Restart services
   - Smoke test: log into admin, create issuer → token → sale → phases,
     deploy, run a buy from the launchpad

6. **Document**
   - Append the new addresses to `CONTRACT_VALIDATION_AUDIT.md`
   - Update this doc with "Executed YYYY-MM-DD, see commit X" header
   - Note any deviation from this plan

---

## What's safe to leave broken

Things we explicitly accept will break or become orphaned:

- All existing sales (Wassa Gold, etc.) — old impls, old data
- All existing tokens deployed via the old TokenFactory
- All existing OTC token instances (`0x5c5bA46676fc1764F9E51a966203e387564D96f6`)
- All existing investor wallets' on-chain identity-registry entries
  (we'll re-whitelist via the new registry)
- The Wassa contributions in the dev + staging DBs
- The frontend bookmarks pointing to `/project/wassa-gold-token`

None of these matter — Wassa was always test data.

---

## Estimated time

- Polish (gaps, version, nonce, pass-through setters): 30-60 min
- Write deploy script: 1-2 hours
- Run deploy + verify on Basescan: 30 min
- Update env vars + DB wipe + service restart: 30 min
- Smoke test end-to-end: 30 min

**Total: ~half a day** for someone who knows the codebase.
