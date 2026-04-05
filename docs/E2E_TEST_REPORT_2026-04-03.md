# Cireta Full E2E Test Report — Base Sepolia

**Date:** 2026-04-03 06:30 UTC+4  
**Network:** Base Sepolia (chainId: 84532)  
**Result:** ALL TESTS PASSED  
**Identity Mode:** Simple (whitelist)

---

## Test Wallets

| Role | Address | ETH Balance |
|------|---------|-------------|
| Platform Admin | `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` | 0.049 |
| Issuer | `0x759948398F66310cAE12896644aCD9eAd86A9650` | 0.047 |
| Investor 01 | `0x5c5C4A2563ea79D494a0CA2dCd8d596790651fba` | 0.009 |
| Investor 02 (OTC) | `0x5806C2346F2346940D4505ee81749b514EA0bbc2` | 0.009 |
| OTC Operator | `0x73eE8cBF3461531F177BbF5D4436db0A9f080114` | 0.05 |

## Platform Contracts Used

| Contract | Address |
|----------|---------|
| CiretaTokenFactory | `0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1` |
| CiretaSaleFactory | `0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835` |
| CiretaFractionFactory | `0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42` |
| IssuerRegistry | `0x48066cC2dE6A46561469cf2664b0BD9143aa448c` |
| PlatformFeeManager | `0x7800bc250EbB8bf7d35767F7F3Afd2dCbed114f2` |
| cUSDC (mock stablecoin) | `0xE730be8760dcd7B1dA6EC26F027A5A4aa6c88c72` |

## Contracts Deployed During Test

| Contract | Address | Type |
|----------|---------|------|
| E2E Test Token (eTST) | `0xB1B3D7992602e20D84A736271e507Efc4a79545d` | ERC-3643 Security Token (6 decimals) |
| SimpleIdentityRegistry | `0xb0DBDfB870972753Ab5Ac8e15E8431279d398754` | Whitelist for eTST |
| ModularCompliance | `0xD2d4864D6070C2289464e90Cc1C997fA829D310f` | Compliance for eTST |
| OTC Token (cOTC) | `0xca0da8197C66996b00b4803c7927eF264068ba1E` | MockERC20 (6 decimals) |
| Direct Sale | `0x2c68E1749745A22A9078BeD652e4aE9a018B2740` | Sale.sol proxy |
| Vested Sale | `0x2390DC82D54f600e373d92430eE2f6Cce1007b24` | Sale.sol proxy (vested mode) |
| CiretaVault | `0x4C9dd433090d8eC6bC92AAb4f11f2df020A3B1C2` | Token escrow + vesting |
| CiretaFractionToken | `0x572a5047DC80392506b104f4058516be0a5CE775` | Receipt token (6 decimals) |

---

## Test Steps & Results

### Step 1: Fund Investors with cUSDC
| Investor | cUSDC Balance |
|----------|---------------|
| Investor 01 | 99,700 cUSDC |
| Investor 02 | 100,000 cUSDC |

**Result:** PASSED

---

### Step 2: Register & Activate Issuer
- Issuer already active in IssuerRegistry from previous run
- On-chain status: `isActiveIssuer(0x7599...) = true`

**Result:** PASSED

---

### Step 3: Deploy Token via TokenFactory
- Called `CiretaTokenFactory.deployToken("E2E Test Token", "eTST", 6, issuer)`
- Factory deployed trio: Token + SimpleIdentityRegistry + ModularCompliance
- Token: `0xB1B3D7992602e20D84A736271e507Efc4a79545d`
- Name: E2E Test Token, Symbol: eTST, Decimals: 6

**Result:** PASSED

---

### Step 4: Deploy OTC Token
- Deployed MockERC20 as OTC token: `cOTC` (6 decimals)
- Address: `0xca0da8197C66996b00b4803c7927eF264068ba1E`

**Result:** PASSED

---

### Step 5: Whitelist All Participants
- Added issuer as agent on SimpleIdentityRegistry
- Whitelisted: Issuer, Investor 01, Investor 02, OTC Operator
- Country code: 784 (UAE)
- All verified: `isVerified() = true`

**Result:** PASSED

---

### Step 6: Mint Project Tokens
- Issuer minted 1,000,000 eTST to own wallet
- `SUPPLY_ROLE` required — issuer has it by default

**Result:** PASSED

---

### Step 7: Create Direct Sale
- Called `CiretaSaleFactory.deploySale(token, initData)`
- Sale initialized with OTC token linked: `0xca0d...`
- Phase: "Public Sale" — 1 USDC/token, 10K allocation, min 10 USDC, max 5K USDC
- Whitelisted sale contract in SimpleIdentityRegistry
- Transferred 10,000 eTST to sale contract for direct delivery
- Sale OTC token confirmed: `sale.otcToken() = 0xca0d...`

**Result:** PASSED

---

### Step 8: Admin Activates Sale
- Admin called `Sale.activate()` — required `adminOnly` modifier
- Status changed: 0 (Draft) → 1 (Active)

**Result:** PASSED

---

### Step 9: Investor 01 Buys with USDC
- Approved 200 cUSDC to sale contract
- Called `Sale.buy(0, 200e6)` — phaseId 0, 200 USDC
- Contribution recorded: 200 USDC → 200 eTST
- Tokens transferred immediately (direct mode)
- Investor 01 eTST balance: 200.0

| Check | Value |
|-------|-------|
| Allowance | 200.0 cUSDC |
| Investor verified | true |
| Phase started | true |
| Phase ended | false |
| Static call | PASSED |
| USDC paid | 200.0 |
| Tokens received | 200.0 eTST |

**Result:** PASSED

---

### Step 10: Investor 02 Buys with OTC Token
- Issuer minted 500 cOTC to Investor 02 (representing $500 off-platform payment)
- Investor 02 approved + called `Sale.buyOTC(0, 500e6)`
- OTC tokens burned, project tokens allocated at phase price
- Contribution: isOtc = true
- Investor 02 eTST balance: 500.0
- Total raised (USDC only): 200.0 (OTC excluded from USDC raised)

| Metric | Value |
|--------|-------|
| OTC tokens minted | 500 cOTC |
| OTC tokens burned | 500 cOTC |
| Tokens allocated | 500 eTST |
| isOtc flag | true |
| USDC raised | 200 (OTC excluded) |

**Result:** PASSED

---

### Step 11: Finalize Direct Sale
- Called `Sale.finalizeSale()`
- Total raised (200 USDC) >= soft cap (50 USDC) → FinalizedSuccess
- Status: 3 (FinalizedSuccess)
- Platform fee deducted: 2% of 200 = 4 USDC

**Result:** PASSED

---

### Step 12: Create Vested Sale
- Called `CiretaSaleFactory.deploySaleVested()`
- Deployed: Sale + Vault + FractionToken trio
- FractionToken: cvTST (6 decimals)
- Vesting: cliff 0s, duration 60s
- Phase: 1 USDC/token, 5K allocation
- Admin activated sale
- Whitelisted sale/vault/fraction contract addresses

**Investor 01 buys 100 USDC vested:**
- 100 fraction tokens minted to investor
- No project tokens transferred yet (locked in vault)
- Fraction balance: 100.0

| Contract | Address |
|----------|---------|
| Vested Sale | `0x2390DC82D54f600e373d92430eE2f6Cce1007b24` |
| Vault | `0x4C9dd433090d8eC6bC92AAb4f11f2df020A3B1C2` |
| FractionToken | `0x572a5047DC80392506b104f4058516be0a5CE775` |

**Result:** PASSED

---

### Step 13: Deposit Project Tokens & Finalize Vested Sale
- Issuer deposited 5,000 eTST to vault via `Sale.depositProjectTokens()`
- Called `Sale.finalizeSale()` → Status 3 (FinalizedSuccess)
- Vesting started automatically on finalization

**Result:** PASSED

---

### Step 14: Claim Vested Tokens (Burn Fractions)
- Waited 65 seconds for vesting to complete (60s vesting duration)
- Checked: `vault.getClaimable(investor1) = 100.0 eTST`
- Investor 01 called `vault.claim()`
- Fraction tokens burned: 100 → 0
- Project tokens released: 0 → 100 eTST
- Final Investor 01 balance: 300 eTST (200 from direct + 100 from vested)

| Metric | Before Claim | After Claim |
|--------|-------------|-------------|
| Fraction balance | 100.0 | 0.0 |
| eTST balance | 200.0 | 300.0 |
| Claimable | 100.0 | 0.0 |

**Result:** PASSED

---

## Final Balances

| Wallet | eTST Balance | Notes |
|--------|-------------|-------|
| Investor 01 | 300.0 | 200 (direct USDC) + 100 (vested claim) |
| Investor 02 | 500.0 | 500 (direct OTC) |
| Issuer | ~894,500.0 | 1M minted - 10K to direct sale - 5K to vault |

---

## Summary

| Test Case | Status |
|-----------|--------|
| Token deployment (6 decimals, via factory) | PASSED |
| OTC token deployment and linking | PASSED |
| Investor whitelisting (SimpleIdentityRegistry) | PASSED |
| Token minting (SUPPLY_ROLE) | PASSED |
| Direct sale creation (with OTC token) | PASSED |
| Admin sale activation | PASSED |
| USDC purchase (Investor 01, 200 USDC) | PASSED |
| OTC purchase (Investor 02, 500 cOTC) | PASSED |
| Sale finalization (soft cap met) | PASSED |
| Vested sale creation (Sale + Vault + FractionToken) | PASSED |
| Vested purchase (100 USDC → 100 fractions) | PASSED |
| Project token deposit to vault | PASSED |
| Vested sale finalization | PASSED |
| Vesting completion (60s duration) | PASSED |
| **Claim: fraction burn → project token release** | **PASSED** |

**All 15 test cases passed.**

---

## Issues Found & Fixed During Testing

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Sale contract `initialize()` missing OTC param | Contract not updated | Added `_otcToken` parameter, redeployed impl |
| `buy()` reverted "recipient not verified" | Sale contract address not whitelisted in SimpleIdentityRegistry | Whitelist sale/vault/fraction contract addresses |
| `buy()` reverted silently | Price/allocation decimal mismatch — `pricePerToken` uses 18-dec internal math | Use `1e18` for price, `Xe6` for allocation (matching token decimals) |
| Vested sale deployment failed | FractionFactory owned by admin, not SaleFactory | Transferred ownership to SaleFactory |

## BaseScan Links

- Token: https://sepolia.basescan.org/address/0xB1B3D7992602e20D84A736271e507Efc4a79545d
- Direct Sale: https://sepolia.basescan.org/address/0x2c68E1749745A22A9078BeD652e4aE9a018B2740
- Vested Sale: https://sepolia.basescan.org/address/0x2390DC82D54f600e373d92430eE2f6Cce1007b24
- Vault: https://sepolia.basescan.org/address/0x4C9dd433090d8eC6bC92AAb4f11f2df020A3B1C2
- FractionToken: https://sepolia.basescan.org/address/0x572a5047DC80392506b104f4058516be0a5CE775
