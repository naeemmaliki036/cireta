# Cireta RWA Launchpad — Spec Audit

## Phase Status

| Phase | Status | Tests | Notes |
|-------|--------|-------|-------|
| Phase 1 | Complete | 108 pytest | Core backend: auth, KYC, tokens, sales, portfolio |
| Phase 2 | Complete | 14 Hardhat | Smart contracts: ERC-3643, compliance modules, vesting |
| Phase 3 | Complete | 27 Hardhat | Subgraph, Turborepo, ONCHAINID, Chainlink PoR, DividendDistributor tests |

## Phase 3 Deliverables

### 1. The Graph Subgraph
- `subgraph/package.json` — graph-cli 0.71.0, graph-ts 0.32.0
- `subgraph/schema.graphql` — Transfer, FreezeEvent, SaleContribution, DividendClaim entities
- `subgraph/subgraph.yaml` — dataSources for CiretaToken, Sale, DividendDistributor on Base
- `subgraph/src/mappings.ts` — handleTransfer, handleFreeze, handleContributed, handleClaimed

### 2. Turborepo + pnpm
- `pnpm-workspace.yaml` — packages: apps/*, contracts, subgraph
- `turbo.json` — pipeline for build/test/lint/typecheck
- Root `package.json` updated with turbo ^2.0.0

### 3. ONCHAINID Wiring
- `packages/common/core/config.py` — identity_factory_address, identity_registry_address
- `.env.example` — IDENTITY_FACTORY_ADDRESS, IDENTITY_REGISTRY_ADDRESS
- `apps/api/services/web3_identity_service.py` — deploy_identity() method
- `apps/api/workers/tasks.py` — task_deploy_onchainid calls web3_service.deploy_identity()
- `contracts/scripts/deployIdentity.ts` — Hardhat script with --network --wallet args

### 4. Chainlink PoR Compliance Module
- `contracts/src/compliance/ChainlinkPoRChecker.sol` — IModule impl, AggregatorV3Interface
- `contracts/src/mocks/MockAggregatorV3.sol` — configurable answer + updatedAt
- `contracts/test/ChainlinkPoRChecker.test.ts` — 4 tests (valid, stale, zero, access control)

### 5. DividendDistributor Tests
- `contracts/src/mocks/MockERC20.sol` — testing helper
- `contracts/test/DividendDistributor.test.ts` — 8 tests:
  - depositEpoch event
  - correct claim amount
  - no double-claim
  - pro-rata 2 holders
  - epoch totalAmount
  - multi-epoch claim
  - revert no balance
  - revert zero deposit

## Test Summary

```
Hardhat Tests: 27 passing
- ChainlinkPoRChecker: 5
- CiretaToken: 4
- CiretaTokenFactory: 1
- CountryAllowModule: 4
- DividendDistributor: 8
- ModularCompliance: 2
- VestingVault: 3

Pytest: 108 passing
Vitest: 11 passing
```

## Audit Checklist

- [x] Subgraph entities match contract events
- [x] Turborepo pipeline covers all workspaces
- [x] ONCHAINID config integrated with Settings
- [x] ChainlinkPoRChecker reverts on stale/zero data
- [x] DividendDistributor pro-rata math correct
- [x] All new code committed with descriptive messages
- [x] No TypeScript/Solidity compilation errors
