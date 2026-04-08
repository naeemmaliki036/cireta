# Session Report — 2026-04-08

## Done Today

### 1. Admin UI Overhaul
- Replaced rounded-full/capsule design with square `rounded-md`/`rounded-lg` across all atoms, molecules, organisms, and pages (58 files)
- Moved key CTAs (Create Token, New Sale, Edit, Mint, etc.) to layout header `actions` prop
- Added list/grid view toggle on issuer and platform sales listing pages

### 2. Rich Text Editor (TipTap)
- Upgraded from basic bold/italic to full toolbar: underline, strikethrough, headings, lists, alignment, horizontal rule
- Added GCS image/video upload popover (drag-drop + URL paste)
- Resizable images with drag handle + 25/50/75/100% size presets
- Resizable YouTube embeds with S/M/L/XL presets
- Edit/Preview mode toggle
- Installed: @tiptap/extension-image, youtube, underline, text-align, placeholder

### 3. Safe Wallet Support (Full Stack)
- `useSafeDetection` hook — detects Safe wallets via `getCode()`
- `useSafeContractAction` hook — proposes tx to Safe instead of executing
- `SafeTransactionStatus` component — proposing → proposed → awaiting signatures → confirmed
- Modified `useContractAction` to auto-detect Safe and delegate (all admin pages get Safe support)
- Backend EIP-1271 verification for Safe wallet linking (`wallet_service.py`)
- Backend event listener for deferred tx recording (`event_listener_service.py`)
- Safe App `manifest.json` + CSP iframe headers for both apps
- Installed @safe-global/protocol-kit, api-kit, types-kit in admin app

### 4. E2E Tests
- **Safe wallet flow** (`safe-wallet.flow.ts`): 18 tests — wallet linking, Safe validation, EOA regression
- **Sumsub webhook flow** (`sumsub-webhook.flow.ts`): 23 tests — HMAC validation, GREEN/RED webhooks, on-chain registration, audit logs, idempotency
- Manual webhook test script: `scripts/test-sumsub-webhook.sh`

### 5. Wallet Modal Cleanup
- Switched from `getDefaultConfig` to `connectorsForWallets` + `createConfig`
- Set `multiInjectedProviderDiscovery: false` — removed Phantom, Keplr, TronLink, Exodus
- Safe wallet in Recommended group (only shows inside Safe app iframe)

### 6. "Base L2" Removal
- Removed all "Base L2" references across 21 files (apps, docs, config, metadata)

### 7. Registry RBAC Upgrade
- `SimpleIdentityRegistry` upgraded with AccessControlUpgradeable:
  - `REGISTRAR_ROLE` (add wallets), `COMPLIANCE_ROLE` (remove wallets), `AGENT_ROLE` (legacy full access)
- `IssuerRegistry` upgraded with `ISSUER_MANAGER_ROLE`
- Both contracts deployed + upgraded on Base Sepolia via UUPS proxy upgrade
- All 12 contracts verified on Sourcify
- 26 Hardhat tests passing for role-based access

### 8. Sale Review Step Redesign
- Flat list → sectioned grid (Sale Info, Token & Funding, Content & Media, FAQs, Documents)
- Buttons moved to header for better UX
- Token/payment dropdowns now always show masked addresses

## Remaining Work

### High Priority
- Wire `SafeTransactionStatus` into pages (conditional on `isSafe`)
- SaleDeploymentWizard Safe persistence (Gap 8)
- Admin role management UI (grantRole/revokeRole)

### Medium Priority
- Docker + Railway deploy (Build Step 14)
- Security hardening pass (Build Step 15)
- Basescan verification (blocked by v1→v2 API migration)

### Lower Priority
- More E2E test coverage (investment flow, vesting claim, token transfer)
- Admin compliance page with COMPLIANCE_ROLE
- KYC expiry notifications E2E testing
