# OTC Token Plan — Per-Issuer Payment Instrument

## Overview

Each issuer gets a dedicated OTC ERC-20 token that serves as an alternative payment instrument in the sale contract. OTC tokens allow off-platform deals (bank wire, fiat, private agreements) to be settled on-chain through the same purchase flow as USDC.

## Core Principles

- **Same UI, same flow** — user selects OTC token instead of USDC on the buy page
- **Per-issuer** — each issuer has their own OTC token contract
- **Identity-gated transfers** — OTC tokens can only be transferred to verified wallets (IdentityRegistry)
- **NOT soulbound** — freely transferable between verified wallets, holder's responsibility
- **Works for both sale modes** — vested (fractions) and direct (ERC-3643)
- **Admin deploys** — admin can deploy an issuer's OTC token at any point (not necessarily at onboarding)
- **No fee at mint** — OTC token minting is fee-free; platform fees for OTC deals are handled off-chain or at finalization

## Architecture

```
┌──────────────────────────────┐
│  IssuerOTCToken.sol          │  ERC-20, per issuer
│                              │
│  MINTER_ROLE → issuer wallet │  Issuer mints to self or operators
│  Deployed by: admin          │  Via IssuerOTCTokenFactory
│                              │
│  mint(to, amount):           │
│    Mint OTC tokens to `to`   │  No fee charged
│                              │
│  Transfer restrictions:      │
│    recipient must be in      │  Checked via IdentityRegistry
│    IdentityRegistry          │
│                              │
│  Burned by sale contract     │  On OTC purchase
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Sale Contract               │
│                              │
│  buy(amount)                 │  Pulls USDC (existing)
│  buyOTC(amount)              │  Pulls OTC tokens, burns them
│                              │
│  Both call shared:           │
│  _allocate(buyer, amount,    │
│            isOTC)            │
│                              │
│  Same: identity check,       │
│  phase rules, hard cap,      │
│  vesting (if applicable)     │
└──────────────────────────────┘
```

## OTC Operator Flow

```
Issuer                    OTC Operator              Investor
  │                           │                        │
  │  1. mint OTC tokens       │                        │
  │  (no fee)                 │                        │
  │                           │                        │
  │  2. transfer OTC tokens   │                        │
  │  ──────────────────────►  │                        │
  │  (operator must be        │                        │
  │   verified wallet)        │                        │
  │                           │                        │
  │                           │  3. purchase via dApp   │
  │                           │  buyOTC(amount)         │
  │                           │  receives fractions     │
  │                           │  (vested) or ERC-3643   │
  │                           │  (direct)               │
  │                           │                        │
  │                           │  4. transfer received   │
  │                           │  tokens to investor     │
  │                           │  ──────────────────────►│
  │                           │  (investor must be      │
  │                           │   verified wallet)      │
```

### Identity Verification At Each Step

| Step | Action | Identity Check On |
|------|--------|-------------------|
| 1 | Issuer mints OTC tokens to self | N/A (issuer already verified) |
| 2 | Issuer transfers OTC to operator | **Operator wallet** — checked by OTC token `_update()` |
| 3 | Operator calls `buyOTC()` | **Operator wallet** — checked by sale contract |
| 4a | Operator transfers fractions to investor | **Investor wallet** — checked by CiretaFractionToken `_update()` |
| 4b | Operator transfers ERC-3643 to investor (direct mode) | **Investor wallet** — checked by ERC-3643 transfer restrictions (built into standard) |

## Sale Mode Compatibility

| Sale Mode | Normal Purchase (USDC) | OTC Purchase |
|-----------|------------------------|--------------|
| **Vested** | Pay USDC → receive fractions → claim ERC-3643 after vesting | Pay OTC tokens → receive fractions → claim ERC-3643 after vesting |
| **Direct** | Pay USDC → receive ERC-3643 immediately | Pay OTC tokens → receive ERC-3643 immediately |

## Fee Model

**No fee at OTC token mint time.** Minting is a simple permissioned operation with no USDC cost.

Platform fees for OTC deals are settled separately — either:
- Off-chain invoicing (issuer pays platform fee via bank/wire based on total OTC volume)
- At sale finalization (platform calculates OTC allocation value and deducts from issuer proceeds)

This keeps the OTC token contract simple and avoids requiring issuers to hold USDC just to mint OTC tokens.

## Smart Contracts

### 1. IssuerOTCToken.sol

```solidity
contract IssuerOTCToken is ERC20, AccessControl {
    IIdentityRegistry public identityRegistry;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    // Identity-gated transfers
    function _update(address from, address to, uint256 amount) internal override {
        if (to != address(0) && from != address(0)) {
            require(identityRegistry.isVerified(to), "RecipientNotVerified");
        }
        super._update(from, to, amount);
    }
}
```

### 2. IssuerOTCTokenFactory.sol

- Deployed once by platform
- Admin calls `deployOTCToken(issuerWallet, identityRegistry)` to create per-issuer OTC tokens
- Stores mapping of issuer → OTC token address

### 3. Sale.sol Changes

```solidity
// New state variable
IERC20 public otcToken; // Set at deployment (address(0) if OTC not enabled)

// New function
function buyOTC(uint256 amount) external {
    require(address(otcToken) != address(0), "OTC not enabled");
    require(identityRegistry.isVerified(msg.sender), "Not verified");
    otcToken.transferFrom(msg.sender, address(this), amount);
    // Burn OTC tokens after receiving
    IssuerOTCToken(address(otcToken)).burn(address(this), amount);
    _allocate(msg.sender, amount, true); // isOTC = true
}

// Existing buy() (renamed from contribute())
function buy(uint256 amount) external {
    require(identityRegistry.isVerified(msg.sender), "Not verified");
    paymentToken.transferFrom(msg.sender, address(this), amount);
    _allocate(msg.sender, amount, false);
}

// Shared allocation logic
function _allocate(address buyer, uint256 amount, bool isOTC) internal {
    // Check phase is active
    // Check min/max contribution
    // Calculate tokens: tokensToAllocate = (amount * 1e18) / phase.pricePerToken
    // Check hard cap (USDC + OTC combined)
    // If vested: mint fractions + record vault allocation
    // If direct: transfer ERC-3643 tokens
    // Emit Purchase(buyer, amount, tokensAllocated, isOTC)
}
```

## Backend Changes

### Database Migration

```python
# Issuer model — add field
otc_token_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
```

### Admin Endpoint

```
POST /admin/issuers/{issuer_id}/deploy-otc-token
Body: {}
Response: { otc_token_address: "0x..." }
```

- Calls `IssuerOTCTokenFactory.deployOTCToken()`
- Saves `otc_token_address` to Issuer model
- Only available if issuer doesn't already have an OTC token

### Contribution Model

`is_otc` field already exists on the `Contribution` model. Ensure it's set based on on-chain event data.

### Sale Response

Include `otc_token_address` in sale response (from joined issuer) so frontend knows to show the OTC payment option.

## Frontend Changes

### Launchpad — Buy Page

1. On page load, check connected wallet for:
   - USDC balance (`balanceOf`)
   - OTC token balance (`balanceOf` on issuer's OTC token, if deployed)
2. If OTC balance > 0 → show payment selector: `[USDC] [OTC Token]`
3. If OTC selected:
   - `approve(saleContract, amount)` on OTC token
   - Call `sale.buyOTC(amount)`
4. If USDC selected → existing flow unchanged (`sale.buy(amount)`)

### Launchpad — Transactions Table

| Date | Operation | Amount Paid | Fractions Received | Address |
|------|-----------|-------------|-------------------|---------|
| ... | `Purchase` | 20 USDC | 1 frTGLD | 0xD0... |
| ... | `Purchase (OTC)` | 0 USDC | 5 frTGLD | 0xF3... |

- Detect OTC from `isOTC` flag in Purchase event or `is_otc` field in backend
- Show `(OTC)` badge on operation column
- Amount paid shows "0 USDC" for OTC transactions

### Admin — Issuer Detail Page

- Show "Deploy OTC Token" button if `otc_token_address` is null
- Show OTC token address + total supply stats if deployed

## Deployment Order

1. Deploy `IssuerOTCTokenFactory` contract
2. Backend migration: add `otc_token_address` to Issuer
3. Admin endpoint for deploying OTC token
4. Update Sale contract: rename `contribute()` → `buy()`, add `buyOTC()`
5. Admin frontend: "Deploy OTC Token" button on issuer detail page
6. Launchpad frontend: payment selector on buy page
7. Transaction table: OTC badge
