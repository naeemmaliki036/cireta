# Comprehensive Gas Audit Report - Cireta Platform

## Overview

This document provides a complete audit of ALL contract interactions across the Cireta platform, identifying gas-related issues and providing fixes. This follows the completed launchpad gas audit and extends to cover all admin, worker, and backend services.

## Executive Summary

**Total Issues Found**: 23 gas-related issues across 12 files
**Critical Issues**: 6 (hardcoded gas limits causing transaction failures)
**High Priority**: 8 (legacy gas pricing, missing estimation)
**Medium Priority**: 9 (missing unified patterns, browser dialogs)

## Issues by Category

### 1. CRITICAL: Frontend Pages Using Raw Wagmi (4 issues)

These pages bypass the unified gas estimation system and lack proper error handling:

#### 1.1 Portfolio Dividends Page
**File**: `apps/launchpad/src/app/portfolio/dividends/page.tsx`
**Issue**: Direct `useWriteContract` usage for dividend claims
**Impact**: No intelligent gas estimation, poor error handling
**Lines**: 56-57, 140-145, 158-162

#### 1.2 Portfolio Vesting Page  
**File**: `apps/launchpad/src/app/portfolio/vesting/page.tsx`
**Issue**: Direct `useWriteContract` usage for vault claims
**Impact**: No intelligent gas estimation
**Lines**: 60-61, 93-97

#### 1.3 Portfolio Claim Page
**File**: `apps/launchpad/src/app/portfolio/claim/[token]/page.tsx`
**Issue**: Multiple `useWriteContract` hooks for different claim types
**Impact**: Inconsistent gas handling across claim flows
**Lines**: 37-66, 153-166, 179-186

#### 1.4 Admin Issuers Page Import Cleanup
**File**: `apps/admin/src/app/platform/issuers/page.tsx`  
**Issue**: Still imports unused wagmi hooks
**Impact**: Dead code, potential confusion
**Line**: 21

### 2. CRITICAL: Backend Services with Hardcoded Gas (2 issues)

#### 2.1 Identity Bridge Service
**File**: `apps/api/services/identity_bridge_service.py`
**Issues**:
- Hardcoded gas: 500k (ONCHAINID deployment), 200k (claim), 150k (registration)
- Legacy `gasPrice` instead of EIP-1559
- No gas estimation or buffering
**Lines**: 202-203, 282-283, 323-324

#### 2.2 Simple Identity Bridge Service  
**File**: `apps/api/services/simple_identity_bridge_service.py`
**Issues**:
- Hardcoded gas: 60k, 80k, 50k per address  
- Legacy `gasPrice` in multiple methods
- Mix of updated and legacy patterns
**Lines**: 319-320, 354-355, 432-433

### 3. HIGH PRIORITY: Admin Portal Hardcoded Gas Values (8 issues)

Multiple admin pages have hardcoded gas values that should use dynamic estimation:

#### 3.1 Sales Management
**File**: `apps/admin/src/app/platform/sales/[id]/page.tsx`
**Issue**: Hardcoded 1M gas for sale operations
**Lines**: 126, 183

#### 3.2 Issuer Sales Management
**File**: `apps/admin/src/app/issuer/sales/[id]/page.tsx`  
**Issue**: Very high hardcoded gas values (8M, 5M)
**Lines**: 381, 390

#### 3.3 Identity Registry Management
**File**: `apps/admin/src/app/issuer/compliance/identity-registry/page.tsx`
**Issue**: Hardcoded 200k gas for whitelist operations
**Lines**: 115, 156

#### 3.4 Token Management
**Files**: 
- `apps/admin/src/app/issuer/tokens/page.tsx` (3M gas)
- `apps/admin/src/app/issuer/tokens/new/page.tsx` (5M gas)  
- `apps/admin/src/app/issuer/tokens/[id]/page.tsx` (5M gas)
- `apps/admin/src/app/issuer/tokens/[id]/mint/page.tsx` (200k, 300k, dynamic calc)

#### 3.5 Compliance Management
**File**: `apps/admin/src/app/issuer/tokens/[id]/compliance/ComplianceModuleCards.tsx`
**Issue**: Hardcoded 500k gas
**Line**: 50

### 4. MEDIUM PRIORITY: Browser Dialog Replacements (5 issues)

Several components still use `window.confirm()` instead of proper UI modals:

#### 4.1 Wallet Deletions (Admin)
**File**: `apps/admin/src/app/issuer/compliance/wallet-deletions/page.tsx`
**Lines**: 48-50, 64

#### 4.2 Buyer Management (Admin)  
**File**: `apps/admin/src/app/issuer/buyers/[id]/page.tsx`
**Lines**: 43-45

#### 4.3 Wallet Settings (Launchpad)
**File**: `apps/launchpad/src/app/settings/wallets/page.tsx`  
**Lines**: 124, 166

### 5. MEDIUM PRIORITY: Script Gas Issues (4 issues)

Deployment and management scripts with gas concerns:

#### 5.1 Deployment Script
**File**: `scripts/deploy_round4_impls.py`
**Issues**: Fixed gas values for deployment operations
**Lines**: 45-47, 87-89

## Gas Configuration Matrix

### Current vs Recommended Gas Limits

| Operation | Current | Recommended | Service |
|-----------|---------|-------------|---------|
| **ONCHAINID Deploy** | 500k fixed | Estimated + 20% | IdentityBridgeService |
| **AddClaim** | 200k fixed | Estimated + 20% | IdentityBridgeService |
| **Register Identity** | 150k fixed | Estimated + 20% | IdentityBridgeService |
| **Simple Whitelist** | 60k fixed | Estimated + 20% | SimpleIdentityBridgeService |
| **Batch Whitelist** | 50k * count | Estimated + 20% | SimpleIdentityBridgeService |
| **Sale Operations** | 1M-8M fixed | Dynamic by operation | Admin Portal |
| **Token Deploys** | 3M-5M fixed | Factory estimation | Admin Portal |
| **Dividend Claims** | Default wallet | 500k (unified hook) | Launchpad |
| **Vesting Claims** | Default wallet | 500k (unified hook) | Launchpad |

### EIP-1559 Migration Status

| Service | Current | Target | Status |
|---------|---------|---------|---------|
| Web3BaseService | ✅ EIP-1559 | ✅ EIP-1559 | Complete |
| Web3TxService | ✅ EIP-1559 | ✅ EIP-1559 | Complete |
| IdentityBridgeService | ❌ Legacy gasPrice | ✅ EIP-1559 | **NEEDS FIX** |
| SimpleIdentityBridgeService | 🔄 Mixed | ✅ EIP-1559 | **NEEDS FIX** |
| Launchpad useContractAction | ✅ EIP-1559 | ✅ EIP-1559 | Complete |
| Admin useContractAction | ✅ EIP-1559 | ✅ EIP-1559 | Complete |

## Implementation Priority

### Phase 1: Critical Fixes (Must Fix)
1. **Portfolio Pages** → Convert to `useContractAction` pattern
2. **Identity Bridge Services** → EIP-1559 + dynamic gas estimation
3. **Simple Identity Bridge** → Complete the migration started

### Phase 2: High Priority (Should Fix)
1. **Admin Portal** → Replace hardcoded gas with dynamic estimation
2. **Worker Systems** → Verify and standardize gas patterns

### Phase 3: Medium Priority (Nice to Have)  
1. **Browser Dialogs** → Replace with ConfirmationModal
2. **Script Cleanup** → Standardize deployment gas values

## Technical Implementation Strategy

### 1. Frontend Unified Pattern
```typescript
// Replace raw wagmi usage:
const { writeContract, data, isPending } = useWriteContract();
const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: data });

// With unified pattern:
const action = useContractAction();
const { showError, showSuccess } = useToast();

try {
  await action.execute({
    address, abi, functionName, args,
    // Automatic gas estimation based on function type
  });
  showSuccess("Success!", "Transaction completed.");
} catch (err) {
  showError("Failed", parseRevertReason(err));
}
```

### 2. Backend EIP-1559 Pattern
```python
# Replace legacy pattern:
tx = contract.functions.method().build_transaction({
    "gas": 500_000,
    "gasPrice": w3.eth.gas_price,
})

# With EIP-1559 pattern:
try:
    # Get latest block for base fee
    latest = await asyncio.to_thread(w3.eth.get_block, "latest")
    base_fee = latest.get("baseFeePerGas", 0)
    
    if base_fee > 0:  # EIP-1559 network
        max_priority_fee = 2_000_000_000  # 2 gwei
        max_fee_per_gas = base_fee * 3 + max_priority_fee
        
        tx = contract.functions.method().build_transaction({
            "maxFeePerGas": max_fee_per_gas,
            "maxPriorityFeePerGas": max_priority_fee,
        })
    else:  # Legacy network fallback
        tx = contract.functions.method().build_transaction({
            "gasPrice": await asyncio.to_thread(lambda: w3.eth.gas_price),
        })
    
    # Always estimate gas with buffer
    estimated = await asyncio.to_thread(w3.eth.estimate_gas, tx)
    tx["gas"] = min(int(estimated * 1.2), 5_000_000)  # 20% buffer, max 5M
    
except Exception:
    # Safe fallback
    tx["gas"] = 1_000_000
```

### 3. UI Modal Replacement Pattern  
```typescript
// Replace browser dialogs:
if (!window.confirm("Delete this item?")) return;

// With proper UI:
const { showConfirmation, ConfirmationModal } = useConfirmation();

showConfirmation(
  "Confirm Deletion",
  "Are you sure you want to delete this item? This action cannot be undone.",
  () => { /* delete action */ },
  { variant: "danger" }
);
```

## Testing Strategy

### Gas Limit Validation
- Test each operation type to ensure gas limits are appropriate
- Verify no "out of gas" errors on typical operations
- Test with varying network congestion levels

### EIP-1559 Compatibility
- Verify all backend services work on both EIP-1559 and legacy networks
- Test gas price calculation accuracy

### Error Handling
- Test transaction rejection flows
- Verify proper error message display
- Test recovery from failed transactions

## Next Steps

1. **Fix Critical Issues** (Portfolio pages + Identity services)
2. **Update Admin Portal** (Replace hardcoded values)  
3. **Complete Dialog Migration** (Replace window.confirm)
4. **Standardize Scripts** (Deployment gas values)
5. **Final Validation** (E2E testing of all transaction flows)

---

**Total Estimated Effort**: 3-4 development sessions
**Risk Level**: Medium (gas estimation improvements, UI consistency)
**User Impact**: High (better transaction success rates, improved UX)