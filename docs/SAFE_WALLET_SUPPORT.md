# Safe Wallet Support --- Gap Analysis & Implementation

## Overview

Cireta needs Safe (multisig) wallet support for investors, issuers, and admins. Safe wallets differ from EOAs: transactions are proposed, signed by multiple owners, then executed. Implementation is purely additive --- all existing EOA flows remain untouched.

---

## Current Foundation (Already Implemented)

| Area | Status | Details |
|------|--------|---------|
| Safe connector | Done | Both admin and launchpad wagmi configs include safeWallet in RainbowKit |
| Safe detection | Done | Web3Context (launchpad) calls publicClient.getCode() to detect contract wallets, sets isSafe boolean |
| DB flag | Done | Wallet.is_safe boolean field in model, tracked in audit logs |
| Safe Protocol Kit | Done | apps/launchpad/src/lib/safe/safeClient.ts --- initSafe(), initSafeApiKit(), proposeTransaction() |
| UI awareness | Partial | InvestConfirmStep shows "Propose to Safe" button text |
| Wallet settings | Done | Wallet list shows Safe badge |
| Event listener | Done | Backend polls chain events every ~12s |

---

## Gap Analysis

### Gap 1: Investor Transaction Proposal Flow (P0)

All investor transactions use useWriteContract() directly. Safe wallets need proposeTransaction() instead.

Affected: USDC Approve, Buy Tokens, OTC Buy, Claim Vesting, Claim Refund, Token Transfer

Solution: Create useSafeContractAction() hook that encodes call data and proposes to Safe. Unified useSmartContractAction() checks isSafe and delegates.

### Gap 2: Wallet Linking EIP-1271 (P1)

Wallet linking requires personal_sign. Safe wallets use EIP-1271 contract signatures.

Solution: For Safe wallets, verify connected EOA is a Safe owner. Backend adds isValidSignature() verification alongside existing ecrecover.

### Gap 3: Issuer Contract Interactions via Safe (P1)

All admin on-chain actions use useContractAction() -> useWriteContract(). Fails for Safe.

Affected: Token Deploy, Sale Deploy, Whitelist, Deposit, Mint, Compliance, Withdraw, Pause, Finalize, OTC

Solution: Modify useContractAction() to detect Safe and propose instead of execute.

### Gap 4: Issuer Wallet Onboarding (P3)

Same EIP-1271 issue as Gap 2 for issuer onboarding signature.

### Gap 5: Backend Deferred Transaction Recording (P2)

After deployment, frontend calls record-deployment with tx hash. Safe tx hash is internal, not on-chain.

Solution: Event listener auto-records TokenDeployed/SaleDeployed events, matching back to pending DB records by issuer address. Frontend also allows manual "Check Status".

### Gap 6: Admin Safe Detection (P1)

Only launchpad has isSafe detection. Admin portal has none.

Solution: Create useSafeDetection() hook for admin using getCode().

### Gap 7: Transaction Status UX (P0)

TransactionStatus shows Pending -> Confirming -> Confirmed. Doesn't fit Safe flow.

Safe flow: Proposing -> Proposed -> Awaiting Signatures (X/Y) -> Executing -> Confirmed

Solution: Create SafeTransactionStatus component with Safe-specific states, link to Safe app, signature polling.

### Gap 8: Multi-Step Wizard Flows (P2)

SaleDeploymentWizard has 4-step sequential flow. Safe can't proceed sequentially in one session.

Solution: Persist step state with Safe tx hashes. Show "Proposed --- waiting for Safe execution" + refresh. On return, check executed steps.

---

## Implementation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Gap 1: Investor tx proposal | Medium | Core use case blocked |
| P0 | Gap 7: Safe tx status UX | Medium | Users need feedback |
| P1 | Gap 2: Wallet linking EIP-1271 | Medium | Can't link Safe wallets |
| P1 | Gap 6: Admin Safe detection | Small | Foundation for issuer support |
| P1 | Gap 3: Issuer contract interactions | Medium | Issuers can't deploy |
| P2 | Gap 5: Deferred tx recording | Medium | Delayed confirmations |
| P2 | Gap 8: Multi-step wizard | Large | Complex UX |
| P3 | Gap 4: Issuer onboarding | Small | Same as Gap 2 |

---

## Key Constraint

Zero impact on EOA flows. Every change gated by isSafe check. Existing paths never modified.

---

## Key Files

### New

- apps/admin/src/hooks/useSafeDetection.ts
- apps/launchpad/src/hooks/useSafeContractAction.ts
- apps/admin/src/hooks/useSafeContractAction.ts
- apps/admin/src/lib/safe/safeClient.ts
- SafeTransactionStatus components (admin + launchpad)

### Modified

- apps/admin/src/hooks/useContractAction.ts
- apps/launchpad/src/contexts/Web3Context.tsx
- apps/api/services/wallet_service.py
- apps/api/services/event_listener_service.py
- Investor pages (invest, claim, transfer)
- SaleDeploymentWizard
