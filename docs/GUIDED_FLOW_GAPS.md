# Guided Flow Gaps — Token Creation to Live Sale

## Context
The issuer flow from token creation to live sale has multiple gaps where the UI doesn't enforce prerequisites, leading to silent failures and confusing on-chain reverts. The user had to debug each step manually (mint tokens, whitelist contracts, add phases on-chain, etc.) because the UI didn't guide them through the required sequence.

## Complete Prerequisite Chain (What Must Happen)

```
1. Token Deploy     → Token contract + IdentityRegistry + Compliance created
2. Whitelist Issuer → Issuer wallet added to IdentityRegistry (required for mint)
3. Mint Tokens      → Issuer mints supply to own wallet (SUPPLY_ROLE)
4. Create Sale (DB) → Sale metadata saved, phases/content configured
5. Deploy Sale      → Sale contract (+ Vault for vested) deployed on-chain
6. Whitelist Sale   → Sale contract (+ Vault + Issuer) added to IdentityRegistry
7. Add Phases       → At least one phase added ON-CHAIN via Sale.addPhase()
8. Deposit Tokens   → Tokens transferred to Sale (direct) or Vault (vested)
9. Submit for Approval → Status: pending_approval
10. Admin Approves  → Status: approved
11. Admin Activates → Sale.activate() on-chain → Status: active (LIVE)
```

## Gaps Found (8 Total)

### Gap 1: No guidance to mint tokens after token deploy
**Where:** Token detail page (`apps/admin/src/app/issuer/tokens/[id]/page.tsx`)
**Impact:** Issuer creates sale with 0 minted supply → deposit fails with "insufficient unfrozen balance"
**Fix:** Show a prominent banner after deploy: "Next step: Mint tokens to your wallet before creating a sale." Link to mint page.

### Gap 2: No check that issuer is whitelisted before minting
**Where:** Token mint page (`apps/admin/src/app/issuer/tokens/[id]/mint/page.tsx`)
**Impact:** `mint()` succeeds (SUPPLY_ROLE skips identity check), but tokens can't be transferred later
**Fix:** Check `identityRegistry.isVerified(issuerWallet)` and show warning + auto-whitelist button if not.

### Gap 3: AddPhaseForm not shown for approved sales
**Where:** Sale detail page line 718
**Impact:** Issuer can't add on-chain phases after sale is approved — activation fails
**Fix:** Already fixed (show for approved/approved_coming_soon). ✅ Done.

### Gap 4: No token balance check before deposit
**Where:** SaleSetupChecklist deposit step
**Impact:** Issuer clicks "Approve & Deposit" with 0 tokens → confusing ERC-20 error
**Fix:** Read `token.balanceOf(issuerWallet)` and show: "Your wallet has X tokens. Mint more if needed." Disable deposit button if balance < required amount.

### Gap 5: Phases exist in DB but not on-chain
**Where:** SaleSetupChecklist phases step
**Impact:** DB shows phases configured, admin activates, but on-chain `phases.length == 0` → revert
**Fix:** Read `Sale.getPhaseCount()` on-chain and compare with DB phases. Show "X phases in DB, Y on-chain. Sync missing phases." with a "Sync All Phases" button that calls `addPhase()` for each.

### Gap 6: Admin can approve/activate without prerequisite checks
**Where:** Platform admin sale page (`apps/admin/src/app/platform/sales/[id]/page.tsx`)
**Impact:** Admin activates sale missing phases/tokens → on-chain revert
**Fix:** Before activate button, read on-chain: phase count, token balance in sale/vault. Show red warnings for missing prerequisites. Disable activate if any prerequisite fails.

### Gap 7: No on-chain status on existing phases + no deploy button
**Where:** Sale detail page phases section (line 692-717)
**Impact:** DB phases show with no indication whether they exist on-chain. Issuer can't tell which phases need syncing.
**Fix:**
- Read `Sale.getPhaseCount()` on-chain to know how many phases exist
- For each DB phase, show badge: "On-Chain" (green) or "Not Deployed" (amber)
- For phases not on-chain, show a "Deploy On-Chain" button that calls `Sale.addPhase()` with the DB phase data
- Add a "Deploy All Phases" batch button if multiple phases are pending

### Gap 8: SaleSetupChecklist phases step has no action
**Where:** SaleSetupChecklist phases step (line 464-468)
**Impact:** The step just says text "Add phases from the sale detail section below" — no actual action button
**Fix:** Replace text with on-chain phase count vs DB phase count comparison. Add "Sync All to Chain" button.

## Files to Modify

### 1. `apps/admin/src/app/issuer/sales/[id]/page.tsx` — Phase on-chain status + deploy buttons
**Lines 692-731 (phases section):**
- Use `useReadContract` to read `Sale.getPhaseCount()` from the sale contract
- For each DB phase at index `i`: if `i < onChainPhaseCount` → show green "On-Chain" badge, else show amber "Not Deployed" badge + "Deploy On-Chain" button
- "Deploy On-Chain" button encodes the DB phase data and calls `Sale.addPhase()` via `useContractAction`
- Add "Deploy All Phases" batch button above the phase list if any phases are pending
- After successful deploy, refetch on-chain count + reload sale data

**Existing code to reuse:**
- `SALE_ABI` already has `addPhase`, `getPhaseCount`, `getPhase` (lines 34, 142, 149 in `sale.ts`)
- `useContractAction` hook for tx execution
- `parseUnits` from viem for conversion (already used in `AddPhaseForm.tsx:112-119`)
- Phase data fields: `name`, `price_per_token`, `allocation`, `min_contribution`, `max_contribution`, `start_time`, `end_time`, `whitelist_only`

### 2. `apps/admin/src/components/molecules/SaleSetupChecklist.tsx` — Phases step action
**Lines 464-468:**
- Replace text with: "X of Y phases deployed on-chain" status
- Read `Sale.getPhaseCount()` on-chain
- Compare with `sale.phases.length` from DB
- Add "Sync All Phases" button if count differs
- Mark step as complete when counts match

### 3. `apps/admin/src/components/molecules/SaleSetupChecklist.tsx` — Deposit step balance check
**Lines 470-494:**
- Read `token.balanceOf(issuerWallet)` on-chain
- Show: "Your balance: X tokens, Required: Y tokens"
- If balance < required: show "Mint X more tokens first" warning, disable deposit button

### 4. `apps/admin/src/app/issuer/tokens/[id]/page.tsx` — Post-deploy mint guidance
- Read `token.totalSupply()` on-chain after deploy
- If 0: show banner "Next: Mint tokens to your wallet before creating a sale"

### 5. `apps/admin/src/app/platform/sales/[id]/page.tsx` — Pre-activate checks
- Before "Activate" button, read on-chain:
  - `Sale.getPhaseCount()` must be > 0
  - Token balance in sale/vault must be > 0
- Show red warnings for missing prerequisites
- Disable activate button if any prerequisite fails

## Verification
After implementation:
1. Create a new token → should see "Mint tokens" guidance
2. Deploy sale → SaleSetupChecklist should show in order with sync button
3. Click "Sync Phases" → phases written on-chain
4. Deposit → should check balance first
5. Admin activate → should check on-chain prerequisites before allowing
6. Full flow should complete without any manual debugging
