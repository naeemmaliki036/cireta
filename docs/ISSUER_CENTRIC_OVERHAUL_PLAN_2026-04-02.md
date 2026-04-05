# Issuer-Centric Platform Overhaul — Gap Analysis & Implementation Plan

**Date:** 2026-04-02  
**Status:** IMPLEMENTED

## Context

Currently, the platform admin (deployer wallet) deploys everything — tokens, sales, phases. The desired model: **issuers self-serve, admin approves**. Admin onboards issuers, sets fees, and approves sales to go live. Issuers deploy their own sales, manage phases/whitelists, collect proceeds. Admin retains regulatory override powers.

**Naming convention:** Replace OZ's generic `onlyOwner` with explicit `adminOnly` for platform admin, and `onlyIssuerOrAdmin` for dual authority.

**Admin resolution:** Sale contracts do NOT store a hardcoded admin address. Instead, each Sale stores a `factory` address (the CiretaSaleFactory that deployed it) and resolves admin dynamically via `factory.owner()`. This means changing admin on the factory propagates to ALL deployed sales instantly — zero migration.

---

## Gap Analysis — What's Missing

### GAP 1: Issuers cannot deploy sales
- `CiretaSaleFactory.deploySale()` is `onlyOwner` — only admin can call
- `CiretaSaleFactory.deploySaleVested()` is `onlyOwner`
- Factory has no reference to `IssuerRegistry` to verify the caller is an active issuer
- Factory has no reference to `PlatformFeeManager` to enforce correct fees
- No `issuerSales` tracking (which issuer deployed which sales)

### GAP 2: Sale lifecycle permissions are admin-only
- `Sale.addPhase()` — `onlyOwner` (should be issuer-only)
- `Sale.setWhitelist()` — `onlyOwner` (should be issuer-only)
- `Sale.pause()` — `onlyOwner` (should be dual — both need emergency pause)
- `Sale.setMaxPerBlock()` — `onlyOwner` (should be issuer-only)
- `Sale.setOTCToken()` — `onlyOwner` (should be issuer-only)
- `Sale.setSaleStructure()` — `onlyOwner` (should be issuer-only)
- `Sale.activate()` — `onlyOwner` — CORRECT, admin approves going live
- `Sale.unpause()` — `onlyOwner` — CORRECT, only admin can unpause (regulatory)

### GAP 3: Fee not enforced on-chain during sale deployment
- Issuer constructs `initData` with `feeBasisPoints` — nothing prevents them from setting it to 0
- Factory needs to verify fee matches `PlatformFeeManager.getFeeForIssuer(issuer)` after deployment

### GAP 4: CiretaToken has no admin roles
- `initialize()` grants all 5 roles only to issuer (`owner_`)
- Platform admin gets NO roles on the token
- Admin cannot freeze wallets, force transfers, or recover wallets for regulatory compliance
- No `admin_` parameter in `initialize()`

### GAP 5: Sale ownership model is wrong for the new flow
- In vested mode, `deploySaleVested()` transfers Sale ownership to issuer
- But `activate()` is `onlyOwner` — if issuer is owner, they can self-activate and bypass admin approval
- Sale needs explicit `admin` + `issuer` addresses instead of OZ Ownable

### GAP 6: No emergency withdrawal mechanism
- `withdrawFunds()` is `onlyIssuerOrOwner` — if issuer disappears, funds are stuck
- Need `emergencyWithdraw()` with `adminOnly` and a mandatory delay (30 days post-finalization)

---

## Proposed Access Control Model

### Sale.sol — Factory-Based Admin Lookup

```solidity
address public factory;  // CiretaSaleFactory — admin resolved via factory.owner()
address public issuer;   // token issuer — day-to-day operations

uint256 public constant EMERGENCY_WITHDRAW_DELAY = 90 days;
uint256 public finalizedAt;

// Admin is resolved dynamically — single source of truth
function admin() public view returns (address) {
    return OwnableUpgradeable(factory).owner();
}

function _isAdmin() internal view returns (bool) {
    return msg.sender == factory || msg.sender == OwnableUpgradeable(factory).owner();
}

modifier adminOnly() {
    if (!_isAdmin()) revert NotAdmin();
    _;
}

modifier onlyIssuer() {
    if (msg.sender != issuer) revert NotIssuer();
    _;
}

modifier onlyIssuerOrAdmin() {
    if (msg.sender != issuer && !_isAdmin()) revert NotIssuerOrAdmin();
    _;
}
```

**Key design:** The factory itself is treated as admin (`_isAdmin` returns true for `msg.sender == factory`). This allows `deploySaleVested()` to call `setVestedMode()` without any temporary admin transfer dance.

### Sale.sol — Function Permission Matrix

| Function | Modifier | Who | Rationale |
|----------|----------|-----|-----------|
| `activate()` | `adminOnly` | Admin | Regulatory approval gate |
| `pause()` | `onlyIssuerOrAdmin` | Both | Emergency pause from either side |
| `unpause()` | `adminOnly` | Admin | Only admin can lift regulatory hold |
| `addPhase()` | `onlyIssuer` | Issuer | Issuer configures their own sale |
| `setWhitelist()` | `onlyIssuer` | Issuer | Issuer manages their investors |
| `setMaxPerBlock()` | `onlyIssuer` | Issuer | Issuer's anti-frontrunning config |
| `setOTCToken()` | `onlyIssuer` | Issuer | Issuer's OTC setup |
| `setSaleStructure()` | `onlyIssuer` | Issuer | Issuer's choice |
| `setVestedMode()` | `adminOnly` | Admin | Only called by factory during deploy |
| `issuerAllocate()` | `onlyIssuer` | Issuer | Issuer allocates their own OTC |
| `depositProjectTokens()` | `onlyIssuer` | Issuer | Issuer deposits their own tokens |
| `finalizeSale()` | `onlyIssuerOrAdmin` | Both | Issuer finalizes normally; admin override for abandoned sales |
| `withdrawFunds()` | `onlyIssuer` | Issuer | Issuer's own proceeds — admin cannot touch |
| `emergencyWithdraw()` | `adminOnly` | Admin | **NEW** — only after 90 days post-finalization |
| `_authorizeUpgrade()` | `adminOnly` | Admin | UUPS upgrade authorization |

### CiretaToken.sol — Role Matrix

| Role | Issuer | Admin | Rationale |
|------|--------|-------|-----------|
| `DEFAULT_ADMIN_ROLE` | YES | YES | Both can manage roles |
| `AGENT_ROLE` (pause, forcedTransfer) | YES | YES | Both need emergency powers |
| `FREEZE_ROLE` (freeze/unfreeze) | YES | YES | Both need for different reasons |
| `RECOVERY_ROLE` (wallet recovery) | YES | YES | Both need recovery capability |
| `SUPPLY_ROLE` (mint/burn) | YES | **NO** | Admin must NOT mint/burn issuer's tokens |

### CiretaSaleFactory.sol — Issuer Deployment

- `deploySale()` changes from `onlyOwner` to `onlyActiveIssuer`
- `deploySaleVested()` changes from `onlyOwner` to `onlyActiveIssuer`
- Factory adds `issuerRegistry` + `platformFeeManager` references
- Factory verifies fee matches PlatformFeeManager after deployment
- Factory verifies issuer == msg.sender in deployed Sale
- New `issuerSales` mapping tracks which issuer deployed which sales

### Token Deployment — stays admin-only

`CiretaTokenFactory.deployToken()` stays `onlyOwner`. Token deployment is one-time, high-stakes, and binds to shared platform infrastructure.

---

## Emergency Withdrawal (Option 3)

```solidity
function emergencyWithdraw(address recipient) external adminOnly nonReentrant {
    if (status != SaleStatus.FinalizedSuccess) revert SaleNotFinalized();
    if (block.timestamp < finalizedAt + EMERGENCY_WITHDRAW_DELAY) revert DelayNotElapsed();
    if (recipient == address(0)) revert ZeroAddress();
    uint256 remaining = paymentToken.balanceOf(address(this));
    if (remaining == 0) revert NothingToWithdraw();
    paymentToken.safeTransfer(recipient, remaining);
    emit EmergencyWithdraw(recipient, remaining);
}
```

Issuer gets first right to withdraw. If they don't within 90 days of finalization, admin can redirect funds via emergency withdrawal.

---

## Suspended Issuer Handling

- Existing sales keep working (they have their own state)
- Admin can `pause()` or `finalize()` the sale
- Issuer can no longer deploy NEW sales (fails `onlyActiveIssuer`)
- No on-chain coupling between Sale and IssuerRegistry at runtime
