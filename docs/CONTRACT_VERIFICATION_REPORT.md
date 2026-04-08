# Smart Contract Verification Report

**Date:** 2026-04-08
**Network:** Base Sepolia (Chain ID: 84532)
**Verification Platform:** Sourcify (full match)
**Note:** Basescan/Etherscan v1 API deprecated — v2 migration pending on their infrastructure. All contracts verified via Sourcify instead.

## Deployed & Verified Contracts

| # | Contract | Proxy Address | Implementation | Status |
|---|----------|--------------|----------------|--------|
| 1 | SimpleIdentityRegistry | `0xD4Bb57300F1cE6b8dD84de7C904B2E7Ac9AF5695` | `0x7690c36F787A8951810Cec763a34e3E52492d166` | Verified |
| 2 | IssuerRegistry | `0x48066cC2dE6A46561469cf2664b0BD9143aa448c` | `0x1ef2f1C199D91cB755b5bC0621cDB73c00f867E9` | Verified |
| 3 | CiretaTokenFactory | `0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1` | `0x9210cE2424D7BBC26Fc064694A5ECCd68D14f0bf` | Verified |
| 4 | CiretaSaleFactory | `0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835` | `0x3b8E2291078B3Ba35F3C721C09DEfA332Fd9C563` | Verified |
| 5 | CiretaFractionFactory | `0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42` | `0x87913811CdE7990461F972274f4e1A8d324e9403` | Verified |
| 6 | PlatformFeeManager | `0x7800bc250EbB8bf7d35767F7F3Afd2dCbed114f2` | `0xDB91131D1567FCb172Fd2D386124AB2567b9a1E6` | Verified |
| 7 | CountryAllowModule | `0xc3a2c6B72EDFf1E60be60969d80612809887c88e` | `0x26bD1BE8f5Fb01745569A1D42aA4200054ad18A1` | Verified |
| 8 | MaxHolderCountModule | `0x2C616041C8CEe744f238F4376cF18B81267Ec2B3` | `0x4d507b8BbBFD24b231d9D6462138BEbb4Ba8fc78` | Verified |
| 9 | OTCTokenFactory | `0x432Ce8ccAa590C895C153121d36cd8992e344022` | `0x143246ACE7Bc268e57bcB7B9DEBE4000b4Aeba5E` | Verified |
| 10 | cUSDC (Mock Stablecoin) | `0xE730be8760dcd7B1dA6EC26F027A5A4aa6c88c72` | — (not upgradeable) | Verified |

**Total: 12/12 contracts verified**

## Recent Upgrades (2026-04-08)

### SimpleIdentityRegistry — RBAC Upgrade
- **Upgrade tx:** `0xe00af58cf98972fdce44897151728b72f170f637efed62ac7f8faadcc1b940a5`
- **New implementation:** `0x7690c36F787A8951810Cec763a34e3E52492d166`
- **Changes:** Added AccessControlUpgradeable with REGISTRAR_ROLE, COMPLIANCE_ROLE, AGENT_ROLE
- **Roles granted:**
  - `DEFAULT_ADMIN_ROLE` → `0x759948398F66310cAE12896644aCD9eAd86A9650` (deployer/owner)
  - `AGENT_ROLE` + `REGISTRAR_ROLE` → `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` (backend signer)

### IssuerRegistry — RBAC Upgrade
- **Upgrade tx:** `0x22c70356ac1601144b828710ab9460864020ec9f47b0da0877183953a69fd35e`
- **New implementation:** `0x1ef2f1C199D91cB755b5bC0621cDB73c00f867E9`
- **Changes:** Added AccessControlUpgradeable with ISSUER_MANAGER_ROLE
- **Roles granted:**
  - `DEFAULT_ADMIN_ROLE` → `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` (platform admin)
  - `ISSUER_MANAGER_ROLE` → `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` (admin) + `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` (signer)

## Key Addresses

| Purpose | Address |
|---------|---------|
| Platform Admin | `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` |
| Deployer/IR Owner | `0x759948398F66310cAE12896644aCD9eAd86A9650` |
| Backend Identity Signer | `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` |

## Sourcify Links

All contracts can be viewed at:
```
https://repo.sourcify.dev/contracts/full_match/84532/{address}/
```

## Basescan Explorer

Contracts viewable at:
```
https://sepolia.basescan.org/address/{address}
```
