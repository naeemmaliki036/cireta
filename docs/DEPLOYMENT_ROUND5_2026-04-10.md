# Round-5 Fresh Deploy — Base Sepolia (2026-04-10)

**Date:** 2026-04-10
**Network:** Base Sepolia (chainId: 84532)
**Identity Mode:** Simple (whitelist-based)
**Deployer:** `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c`
**Platform Admin:** `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3`
**Fee Receiver:** `0x7C7fAF2473C43A8F02e70B93938e436FADeFfcbb`
**Gas Used:** 0.000179 ETH (~$0.05)
**Remaining Balance:** 0.1995 ETH
**Contract Version:** 5.0.0 (all impls)

---

## Why

Round-5 was a breaking-change rewrite of the sale stack (see
[`ROUND_5_SPEC.md`](./ROUND_5_SPEC.md)). The existing testnet state (Wassa
Gold and friends) was incompatible with the new contract code:

- `Sale.initialize` gained 3 new params (`saleStartTime`, `saleEndTime`, `totalTokenSupply`)
- `addPhase` gained 2 new params (`topUpMin`, `allocationMode`)
- `CiretaFractionToken` replaced by `CiretaFractionToken1155` (ERC-1155, soul-bound)
- `CiretaVault` restructured for dual-id vesting (USDC id 1, OTC id 2)
- Storage layouts changed across all contracts

Rather than upgrade-migrate, we did a clean fresh deploy per
[`FRESH_DEPLOY_PLAN.md`](./FRESH_DEPLOY_PLAN.md) (Option A: keep UUPS).

---

## Deployed Contracts

### Platform Registries (UUPS proxies)

| Contract | Address | Owner |
|---|---|---|
| IssuerRegistry | `0x7278011896b1f7Ca51477538afD85225099b6912` | Platform Admin |
| PlatformFeeManager | `0x1ad2143e752520F8A6ACe8c172Ca67883f476a1f` | Platform Admin |

### Implementation Contracts (bare, behind factory proxies)

| Contract | Address | Notes |
|---|---|---|
| CiretaToken | `0x1aeB8A49A3266b328CAbB95537315d12DCBd0355` | ERC-3643 security token |
| SimpleIdentityRegistry | `0x3F36F7f528567Ada31d28092463152f950D37Aa1` | Whitelist-based KYC |
| ModularCompliance | `0x6Ab573e1f83e3731ce2cCd77C3a9086191dD7fdE` | Token transfer compliance |
| Sale | `0x9d2C943F45018968BDF7dc17798650d96864969E` | Round-5: 14-arg init, ERC-1155 fractions, open-ended, two-step activation |
| CiretaFractionToken1155 | `0xbaB007f497ABf971bE37685fa2F6117F1e1854fC` | NEW: replaces ERC-20 fraction token. Soul-bound, id 1 = USDC, id 2 = OTC |
| CiretaVault | `0x6fD292c6e7b1C6651fDBA50433eD12d296ab938A` | Round-5: dual-id vesting, KYC re-check on claim |
| IssuerOTCToken | `0x98c12B5aE74fb4cF6cfda297Aa8Cd77D2c183963` | Per-issuer OTC voucher (6 decimals) |

### Factories (UUPS proxies)

| Contract | Address | Owner | Points To |
|---|---|---|---|
| CiretaTokenFactory | `0x2712a6C30849EA47C0C2700e36Cc0A689a0bEF1d` | Platform Admin | CiretaToken impl + SimpleIdentityRegistry impl |
| CiretaSaleFactory | `0xDc680f69dB1Be83dCE9cB3426f056973C74E04AC` | Platform Admin | Sale impl. Has pass-through setters for FractionFactory impls |
| CiretaFractionFactory | `0x23bFd2892af2EC5332F5559eE4b3AA4C4417efE1` | SaleFactory | FractionToken1155 impl + Vault impl |
| IssuerOTCTokenFactory | `0x203c3E3bCE9623cB8D23398F8c39Bd4C9C67626A` | Platform Admin | IssuerOTCToken impl |

### Compliance Modules (UUPS proxies)

| Contract | Address | Owner |
|---|---|---|
| CountryAllowModule | `0x2e0DDb773e9822c3FA10Db9a7Fb265A544f10297` | Platform Admin |
| MaxHolderCountModule | `0xC6563D87732375b2e57651d967Fb04399aC10B99` | Platform Admin |

### Testnet Mock Tokens

| Contract | Address | Notes |
|---|---|---|
| CiretaUSDC (cUSDC) | `0x225A62D44091E567cF9f5BF31D795Ee173E1f2Cf` | 6-decimal mock USDC for testing |

### Platform-Wide Identity Registry (UUPS proxy, deployed separately)

| Contract | Address | Owner | Notes |
|---|---|---|---|
| SimpleIdentityRegistry | `0x390F619D7C7d2e87E674Db36E0FD27a9402B517a` | Platform Admin | REGISTRAR_ROLE → backend signer (`0xd1C9...`). Used by backend for auto-whitelisting KYC-verified users across all sales. |

---

## Cross-Contract Wiring (verified)

| Relationship | Status |
|---|---|
| SaleFactory → IssuerRegistry | Wired |
| SaleFactory → PlatformFeeManager | Wired |
| SaleFactory → FractionFactory | Wired |
| FractionFactory ownership → SaleFactory | Transferred (enables `deploySaleVested`) |
| TokenFactory → SimpleIdentityMode | Enabled |
| OTCFactory → IssuerRegistry | Wired |
| All proxy ownership → Platform Admin | Transferred (deployer has zero access) |

---

## On-Chain Verification

```
Sale impl version():     "5.0.0"
SaleFactory owner():     0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3 (platform admin)
SaleFactory saleImpl():  0x9d2C943F45018968BDF7dc17798650d96864969E (correct)
FractionFactory owner(): 0xDc680f69dB1Be83dCE9cB3426f056973C74E04AC (SaleFactory — correct)
```

---

## Post-Deploy Checklist

- [x] Contracts deployed (16 total)
- [x] Ownership transferred to platform admin
- [x] Fee receiver set
- [x] `contracts/deployments/base-sepolia.json` updated
- [x] Old addresses backed up to `deployments/base-sepolia.backup-2026-04-10.json`
- [ ] `.env` + `apps/launchpad/.env.local` + `apps/admin/.env.local` updated with new addresses
- [ ] Railway env vars updated on staging services
- [ ] Grant `REGISTRAR_ROLE` on new SimpleIdentityRegistry to backend signer
- [ ] Wipe stale DB tables (token_sales, sale_phases, contributions referencing old contracts)
- [ ] Run Alembic migration 029 (round-5 columns)
- [ ] Restart staging services
- [ ] Smoke test: create issuer, token, sale, phases, deploy, buy, finalize

---

## Env Vars to Update

```bash
# Root .env
SALE_FACTORY_ADDRESS=0xDc680f69dB1Be83dCE9cB3426f056973C74E04AC
TOKEN_FACTORY_ADDRESS=0x2712a6C30849EA47C0C2700e36Cc0A689a0bEF1d
FRACTION_FACTORY_ADDRESS=0x23bFd2892af2EC5332F5559eE4b3AA4C4417efE1
OTC_FACTORY_ADDRESS=0x203c3E3bCE9623cB8D23398F8c39Bd4C9C67626A

# Frontend (launchpad + admin)
NEXT_PUBLIC_SALE_FACTORY_ADDRESS=0xDc680f69dB1Be83dCE9cB3426f056973C74E04AC
NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=0x2712a6C30849EA47C0C2700e36Cc0A689a0bEF1d
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0x390F619D7C7d2e87E674Db36E0FD27a9402B517a
IDENTITY_REGISTRY_ADDRESS=0x390F619D7C7d2e87E674Db36E0FD27a9402B517a
NEXT_PUBLIC_USDC_ADDRESS=0x225A62D44091E567cF9f5BF31D795Ee173E1f2Cf
NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS=0x1ad2143e752520F8A6ACe8c172Ca67883f476a1f
NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS=0x7278011896b1f7Ca51477538afD85225099b6912
```

---

## Previous Deploy (abandoned)

The round-4 addresses are preserved in `deployments/base-sepolia.backup-2026-04-10.json`.
Key differences from this deploy:

- Sale impl was `0xD33f9b09...` (round-4, 11-arg init)
- OTC impl was `0x928884Aa...` (round-4)
- Vault + FractionToken impls were pre-round-4 (couldn't be swapped due to factory ownership gap — now fixed with pass-through setters)
- All Wassa Gold test data (sales, phases, contributions) references the old addresses
