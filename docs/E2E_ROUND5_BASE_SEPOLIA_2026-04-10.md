# Round-5 E2E Test — Base Sepolia (2026-04-10)

Full lifecycle test of the round-5 sale stack on Base Sepolia staging.
All steps executed via hardhat console against live contracts.

---

## Wallets Used

| Role | Address | Notes |
|---|---|---|
| Admin (Platform) | `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` | Owns all factories, approves sales |
| Deployer / Signer | `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` | REGISTRAR_ROLE on platform registry, mints cUSDC |
| Identity Registrar | `0xF3D37e6676714AC9C353E11824E4DD6b85952293` | REGISTRAR_ROLE on platform registry, whitelists wallets |
| Issuer | `0x759948398F66310cAE12896644aCD9eAd86A9650` | Deploys tokens/sales, adds phases, activates |
| Investor | `0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba` | Buys tokens with cUSDC |

---

## Deployed Test Contracts

| Contract | Address | Notes |
|---|---|---|
| CiretaToken (R5GOLD) | `0xD5f097325390240E350432398E32Eb9b0Af24800` | 6 decimals, uses platform-wide SimpleIdentityRegistry |
| ModularCompliance | `0xB029706BBC25ca08723355DBa33065F86F0Af8d5` | Bound to R5GOLD token |
| Sale (vested) | `0xD96B313B18610cCe523Cc27BFBE6B68b2324b5c4` | Round-5, version 5.0.0 |
| CiretaVault | `0xbd892689bA1b822743E00504F7ADef631C9d321C` | 30-day cliff, 180-day vesting |
| CiretaFractionToken1155 | `0x590f00D3FAaEE4Cec797c11A55AD010602F6d3e1` | Soul-bound, id=1 (USDC), id=2 (OTC) |
| Platform SimpleIdentityRegistry | `0x390F619D7C7d2e87E674Db36E0FD27a9402B517a` | Shared across all tokens/sales |

Previous failed attempt (Sale #1) at `0x41aED61030B8B9eb09ac58128Fa68b25A969CF77`
had `pricePerToken = 1e18` instead of `1e6`, causing `AmountTooSmall` on buy.
Abandoned in favour of Sale #2.

---

## Steps Executed

### Step 1: Register + Activate Issuer
- IssuerRegistry: `0x7278011896b1f7Ca51477538afD85225099b6912`
- Registered "Test Issuer R5" (jurisdiction: AE)
- Activated by admin
- **Note:** `activateIssuer` reverted on first attempt (nonce collision after `registerIssuer` in same block). Succeeded on retry.

### Step 2: Whitelist on Identity Registry
- Registrar wallet `0xF3D37e...` granted `REGISTRAR_ROLE` on platform registry
- Funded registrar with 0.01 ETH from signer (had 0 balance)
- Whitelisted: issuer, investor, sale contract, vault contract

### Step 3: Deploy Token
- First attempt via `CiretaTokenFactory.deployToken()` deployed a full `IdentityRegistry` (ERC-3643) per token, not a SimpleIdentityRegistry. The per-token registry required `registerIdentity()` with identity contracts — too complex for simple mode.
- **Fix:** deployed CiretaToken directly via `upgrades.deployProxy`, pointing to the platform-wide SimpleIdentityRegistry. Compliance deployed as a separate ModularCompliance proxy bound to the token.
- Minted 100,000 R5GOLD (6 decimals) to issuer.

### Step 4: Deploy Vested Sale
- Used `CiretaSaleFactory.deploySaleVested()` with 14-arg `initialize` calldata
- Parameters: softCap=$1,000, hardCap=$100,000, fee=200bps, 90-day window, totalTokenSupply=100,000
- Auto-deployed: CiretaVault (30d cliff / 180d vesting) + CiretaFractionToken1155
- Sale version confirmed: `"5.0.0"`

### Step 5: Add Phase
- "Seed" phase: $1/token, 50,000 allocation (Fixed mode), min=$100, max=$50,000, topUpMin=$1,000
- **Critical learning:** `pricePerToken` must be in raw units matching token decimals.
  For 6-dec token + 6-dec USDC: `pricePerToken = 1e6` for $1/token.
  Formula: `tokensToAllocate = (amount * 10^tokenDecimals) / pricePerToken`
  With amount=5000e6, tokenDecimals=6: `(5000e6 * 1e6) / 1e6 = 5000e6` = 5000 tokens. Correct.

### Step 6: Deposit Project Tokens
- Approved sale to spend 100,000 R5GOLD
- Called `sale.depositProjectTokens(100000e6)`
- **Required:** sale contract must be whitelisted on the identity registry first, because `token.safeTransferFrom(issuer → sale)` triggers CiretaToken's `_update` which checks `isVerified(to)`.

### Step 7: Admin Approves Sale (on-chain)
- Admin called `sale.approveSale()` — sets `approved = true`
- Round-5 two-step activation: admin approves first, then issuer activates

### Step 8: Issuer Activates Sale (on-chain)
- Issuer called `sale.activate()` — sets status to `Active (1)`
- Requires: `approved == true`, phases > 0, tokens deposited

### Step 9: Mint cUSDC to Investor
- Signer minted 10,000 cUSDC to investor wallet

### Step 10: Investor Buys
- Approved 5,000 cUSDC to sale contract
- Called `sale.buy(0, 5000e6)` — phase 0, 5000 USDC
- **Buy tx:** `0x6f5ef530db0b2747eaaa2589ca933fd9936bfcec2b4ba28a265bbd1ce861fd08`
- Result:
  - `totalRaised: 5,000 USDC`
  - `totalTokenSold: 5,000`
  - `contribution: 5,000 USDC → 5,000 tokens`
  - `paymentContributed: 5,000 USDC`
  - `fractionToken.balanceOf(investor, 1): 5,000` (ERC-1155 id=1 = USDC fraction)

### Step 11: Finalize
- `finalizeSale()` correctly reverted with `CannotFinalize` because:
  - `finalizationPending = false` (hardcap not reached: 5k/100k)
  - `saleEndTime` hasn't passed (90 days out)
- This is **correct round-5 behavior** — finalization is gated by either hardcap flag or window expiry.

---

## On-Chain State (final)

```
Sale status:        1 (Active)
Total raised:       5,000.000000 USDC
Total tokens sold:  5,000.000000
Soft cap:           1,000.000000 USDC (REACHED)
Hard cap:           100,000.000000 USDC
Open-ended:         false
Finalization pending: false
Version:            5.0.0
```

Investor state:
```
paymentContributed: 5,000.000000 USDC
otcContributed:     0
totalContributed:   5,000.000000
contribution.amount: 5,000.000000
contribution.tokensAllocated: 5,000.000000
fractionToken id=1 balance: 5,000.000000
```

---

## Key Learnings

### 1. Token Price Convention
`pricePerToken` is NOT in 18 decimals. It's in the **payment token's raw units**.
For a $1/token sale with 6-dec token and 6-dec USDC: `pricePerToken = 1_000_000` (1e6).
Using 1e18 makes every buy revert with `AmountTooSmall` because the division rounds to 0.

### 2. Contract Whitelisting Required
The CiretaToken's `_update` hook checks `identityRegistry.isVerified(to)` for ALL
non-zero recipients, including contract addresses. Both the **sale contract** and
**vault** must be whitelisted on the identity registry before:
- `depositProjectTokens()` (transfers tokens from issuer → vault via sale)
- `buy()` in Direct mode (transfers tokens from sale → investor)

### 3. TokenFactory Deploys Full IdentityRegistry
`CiretaTokenFactory.deployToken()` deploys a per-token `IdentityRegistry` (the full
ERC-3643 one), not a `SimpleIdentityRegistry`. This registry requires:
- `IdentityRegistryStorage` binding
- `registerIdentity(addr, identityContract, country)` calls
- Actual ONCHAINID identity contracts per investor

For simple mode, **deploy tokens directly** (not via factory) and point them at
the platform-wide `SimpleIdentityRegistry`. This is a known gap — the TokenFactory
needs a `simpleIdentityMode` path that deploys tokens pointing to a given external
SimpleIdentityRegistry instead of creating a per-token IdentityRegistry.

### 4. Registrar Wallet Needs ETH
The identity registrar wallet (`0xF3D37e...`) was unfunded. Any on-chain whitelisting
requires gas. Fund it during deploy setup.

### 5. Nonce Collisions on Sequential Transactions
Calling `registerIssuer()` then immediately `activateIssuer()` from the same wallet
can cause the second tx to use the wrong nonce if the first hasn't confirmed.
The script should `await tx.wait()` between sequential calls from the same wallet
(which it does, but on testnet with fast blocks this can still race).

### 6. Round-5 Finalization is Properly Gated
`finalizeSale()` only works when `finalizationPending` (hardcap/supply hit) or
`saleEndTime` has passed. This prevents premature finalization. To close an active
sale early, use `closeSale(failed)` when no phase is currently active.

---

## Basescan Links

- Buy tx: https://sepolia.basescan.org/tx/0x6f5ef530db0b2747eaaa2589ca933fd9936bfcec2b4ba28a265bbd1ce861fd08
- Sale contract: https://sepolia.basescan.org/address/0xD96B313B18610cCe523Cc27BFBE6B68b2324b5c4
- Token: https://sepolia.basescan.org/address/0xD5f097325390240E350432398E32Eb9b0Af24800
- Vault: https://sepolia.basescan.org/address/0xbd892689bA1b822743E00504F7ADef631C9d321C
- Fraction: https://sepolia.basescan.org/address/0x590f00D3FAaEE4Cec797c11A55AD010602F6d3e1
