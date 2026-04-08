# Safe Wallet (Multisig) Integration Plan

**Date:** 2026-04-08  
**Status:** Planning — Implementation not started  
**Branch:** TBD — `feature/safe-wallets` (to be created from `staging`)  
**Scope:** Investor & Issuer Safe wallet support

---

## Overview

This document outlines the plan to add Gnosis Safe (multisig) wallet support to the Cireta platform for both **investors** and **issuers**.

### Key Insight

Safe wallets are indistinguishable from EOA wallets at the **smart contract level**. A Safe is just another address. The multi-sig verification happens internally within Safe before executing any transaction. This means:

- ✅ **Zero smart contract changes required**
- ✅ Most of the frontend is already done
- ✅ Safe SDK is already installed
- ✅ RainbowKit already includes Safe wallet connector
- ✅ Safe detection already works in Web3Context

---

## Current State (Already Done)

### Frontend — 70% Ready

**1. RainbowKit already has `safeWallet` connector:**
```typescript
// apps/launchpad/src/lib/wagmi.ts
import { safeWallet } from "@rainbow-me/rainbowkit/wallets";

// Already in wallet picker under "More" group
wallets: [
  { groupName: "Recommended", wallets: [...] },
  { groupName: "More", wallets: [rabbyWallet, safeWallet] },  // ← already here
]
```

**2. Safe SDK already installed:**
```json
"@safe-global/api-kit": "^4.0.1",
"@safe-global/protocol-kit": "^6.1.2",
"@safe-global/types-kit": "^3.0.0"
```

**3. Safe detection already in Web3Context:**
```typescript
// Detects if connected wallet has contract code (i.e., is a Safe)
const [isSafe, setIsSafe] = useState(false);
publicClient.getCode({ address }).then(code => setIsSafe(!!code && code !== "0x"));
```

**4. Wallet model already has `is_safe` flag:**
```python
class Wallet(BaseModel):
    is_safe: Mapped[bool] = mapped_column(Boolean, default=False)
```

---

## What Needs to Be Built

### 1. Frontend Changes (~300 LOC)

#### 1a. Promote Safe Wallet in Wallet Picker
```typescript
// Move safeWallet to "Recommended" group
wallets: [
  {
    groupName: "Recommended",
    wallets: [injectedWallet, metaMaskWallet, coinbaseWallet, walletConnectWallet, safeWallet],
  },
  { groupName: "More", wallets: [rainbowWallet, rabbyWallet] },
]
```

#### 1b. Safe-Aware Wallet Linking Flow
When `isSafe = true` during wallet linking:
- Show "This is a Safe multisig wallet" indicator
- Display Safe owners & threshold to user
- Signing message confirms caller is one of the Safe owners
- No different signature flow needed (Safe owners sign with their EOA keys)

#### 1c. Safe Investment UX Note
When investor is connected via Safe:
- Show info banner: "Investing via Safe — transaction will require X-of-Y approvals"
- After initiating investment, direct user to Safe app to collect remaining signatures
- Poll for transaction execution confirmation

#### 1d. Issuer Treasury UI (optional Phase 2)
- Display Safe treasury address in issuer dashboard
- Show pending transactions awaiting multisig approval

---

### 2. Backend Changes (~300 LOC)

#### 2a. Safe Ownership Verification During Wallet Linking

When `is_safe = true` in link request, backend must verify the caller is a Safe owner:

```python
# apps/api/services/wallet_service.py

async def link_wallet(self, user_id, address, signature, nonce, is_safe, label):
    if is_safe:
        # Verify the address has contract bytecode (is actually a Safe)
        code = await web3.eth.get_code(address)
        if code == "0x":
            raise_bad_request("Address is not a contract wallet")
        
        # Get Safe owners from on-chain
        owners = await self._get_safe_owners(address)
        
        # Verify signature is from one of the owners
        recovered = recover_message(signature=signature, text=nonce)
        if recovered.lower() not in [o.lower() for o in owners]:
            raise_unauthorized("Signer is not an owner of this Safe")
        
        # Store Safe with is_safe = True
        wallet = await self.repository.create(...)
```

#### 2b. Register Safe Address in Identity Registry

When a verified investor links a Safe wallet, auto-register Safe address in identity registry:

```python
# After KYC verification + Safe wallet linked
# Register Safe address on-chain so it passes identity checks in Sale.sol

async def register_safe_in_identity_registry(self, user, safe_address):
    # Call IdentityRegistry.registerIdentity(safe_address, onchain_id, country)
    # Uses same onchain_id as the investor's EOA
    # Safe can now call Sale.buy() and pass identity check
```

#### 2c. Safe Transaction Status Monitoring (Optional)

```python
# Poll Safe's on-chain state to detect when transaction is executed
# Notify backend when Safe investment transaction is confirmed
```

---

### 3. Smart Contracts — NO CHANGES

The existing contracts work with Safe wallets out of the box:

```solidity
// Sale.sol — buy() function
function buy(uint256 phaseId, uint256 amount) external {
    // msg.sender can be a Safe address ✓
    if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();
    // Safe transfers USDC ✓
    paymentToken.safeTransferFrom(msg.sender, address(this), amount);
    // Safe receives tokens ✓
    IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
}
```

As long as Safe address is registered in the identity registry (step 2b above), everything works.

---

## End-to-End Flows

### Investor Flow: Linking a Safe Wallet

```
1. User opens Wallet Settings
2. Clicks "Connect Wallet" → Sees Safe in wallet picker
3. Connects Safe via RainbowKit/WalletConnect
4. Safe detected (isSafe = true)
5. User signs ownership message (as Safe owner)
6. Backend verifies signer is one of Safe's on-chain owners
7. Safe address stored with is_safe = true
8. Backend registers Safe address in identity registry (on-chain)
9. Safe is now linked and KYC-verified ✓
```

### Investor Flow: Investing via Safe

```
1. Investor selects project and amount
2. Clicks "Invest" — platform detects Safe wallet
3. Shows banner: "Requires X-of-Y approvals via Safe"
4. Investor approves transaction in Safe app (1st signature)
5. Safe collects remaining signatures from co-owners
6. Once threshold met, Safe executes the transaction
7. Sale.buy() is called with msg.sender = Safe address
8. Identity check passes (Safe is registered)
9. USDC transferred from Safe, tokens received by Safe
10. Investment confirmed ✓
```

### Issuer Flow: Using Safe as Treasury

```
1. Issuer links Safe as their treasury wallet (same linking flow)
2. Platform stores Safe address as issuer's primary wallet
3. Sale proceeds go to Safe treasury address
4. Withdrawals require multisig approval within Safe
5. Issuer team signs via Safe app — no platform changes needed
```

---

## Implementation Plan

### Phase 1: Core Support (Week 1)

| Task | Component | Effort |
|------|-----------|--------|
| Promote Safe in wallet picker | Frontend | 1 hour |
| Safe ownership verification during linking | Backend | 1 day |
| Identity registry registration for Safe | Backend | 1 day |
| Safe indicator in wallet settings UI | Frontend | 2 hours |

### Phase 2: UX Polish (Week 2)

| Task | Component | Effort |
|------|-----------|--------|
| Investment flow Safe awareness banner | Frontend | 2 hours |
| Pending Safe transaction display | Frontend | 1 day |
| Safe transaction monitoring service | Backend | 1 day |
| Safe SDK transaction building utility | Backend | 1 day |

### Phase 3: Issuer Treasury (Week 3 — Optional)

| Task | Component | Effort |
|------|-----------|--------|
| Issuer Safe treasury dashboard | Frontend | 2 days |
| Treasury transaction history | Frontend | 1 day |
| Pending approvals view | Frontend | 1 day |

---

## Libraries Used

| Library | Already Installed | Purpose |
|---------|------------------|---------|
| `@safe-global/protocol-kit` | ✅ v6.1.2 | Transaction building |
| `@safe-global/api-kit` | ✅ v4.0.1 | Off-chain signature collection |
| `@safe-global/types-kit` | ✅ v3.0.0 | TypeScript types |
| `@rainbow-me/rainbowkit` | ✅ v2.2.10 | Safe wallet connector |
| `wagmi` | ✅ v2.16.1 | Wallet interactions |
| `viem` | ✅ v2.30.0 | Low-level blockchain calls |

**No new packages required.**

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| Fake Safe address linked | Verify `getCode()` is non-empty + call `getOwners()` on-chain |
| Non-owner signs for Safe | Verify signature recovery address is in Safe owners list |
| Safe owners change post-linking | Optionally re-verify owners periodically |
| Identity registry out of sync | Register Safe during linking, not lazily |
| Replay attacks on signature | Existing nonce system handles this |

---

## Testing Plan

### Unit Tests
- `SafeWalletService.link_safe_wallet()` — valid + invalid owner
- `SafeWalletService._get_safe_owners()` — on-chain mock
- `IdentityRegistry.registerSafe()` — registration flow

### Integration Tests
- Link Safe wallet with valid owner signature
- Attempt link with non-owner signature (should fail)
- Register Safe in identity registry
- Verify Safe passes `isVerified()` check in Sale contract

### E2E Tests (Testnet)
- Full investor flow with Safe wallet on Base Sepolia
- Full issuer Treasury Safe on Base Sepolia

---

## Branch & PR Strategy

```
origin/staging
    └── origin/feature/safe-wallets  (new branch)
        ├── PR 1: Backend Safe linking + identity registration
        ├── PR 2: Frontend Safe wallet UX
        └── PR 3: Issuer Treasury UI (Phase 3)
```

---

## Summary

| Layer | Changes | Effort |
|-------|---------|--------|
| Smart Contracts | **0 changes** | 0 |
| Backend (Python) | ~300 LOC | 3-4 days |
| Frontend (TypeScript) | ~300 LOC | 3-4 days |
| Database | 0 migrations | 0 |
| New packages | 0 | 0 |
| **Total** | **~600 LOC** | **~1 week** |

Safe wallets work with Cireta's existing contracts without modification. The platform just needs to:
1. Verify Safe ownership during wallet linking
2. Register Safe address in the identity registry
3. Polish the UX to guide users through Safe's multi-sig approval flow
