# Cireta Platform — Testnet Deployment Status

**Date:** 2026-04-03 05:15 UTC+4  
**Network:** Base Sepolia (chainId: 84532)  
**Identity Mode:** Simple (whitelist)  
**Deployer:** `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c`  
**Gas Used:** 0.000089 ETH  
**Deployer Remaining:** 0.1998 ETH  

---

## Ownership

| Role | Address |
|------|---------|
| Platform Admin (owns all contracts) | `0x8eE48b43abb1a53e0a61bB31d0Fc7E898e7f2ac3` |
| Fee Receiver | `0x7C7fAF2473C43A8F02e70B93938e436FADeFfcbb` |
| Deployer (ZERO access after deploy) | `0xd1C9a9EF308aeCC3FEB4281D9BCe00beF46C7C4c` |

---

## Deployed Contracts (13)

### Platform Registries

| Contract | Address | Owner |
|----------|---------|-------|
| IssuerRegistry | `0x48066cC2dE6A46561469cf2664b0BD9143aa448c` | Admin |
| PlatformFeeManager | `0x7800bc250EbB8bf7d35767F7F3Afd2dCbed114f2` | Admin |

### Implementation Contracts (no owner — standalone bytecode)

| Contract | Address |
|----------|---------|
| CiretaToken | `0xF6Ad50CeD5b4cf0fe459F41A6aBeAAcbF15ca9E2` |
| SimpleIdentityRegistry | `0xBe5578488Af2ea64e32a37C37B09075ED3044e20` |
| ModularCompliance | `0x8d7669Cb878796A75E62A6Ba995df97278FB9975` |
| Sale | `0xfB6D87407bd925B435658078B5588214eF6Fb2C2` |
| FractionToken | `0x661f1061428E1F74353C17e188407e3019BAb966` |
| Vault | `0xCb201e07566749aC5C79a68383E8e53047AE28cD` |

### Factories (UUPS proxies)

| Contract | Address | Owner |
|----------|---------|-------|
| CiretaTokenFactory | `0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1` | Admin |
| CiretaSaleFactory | `0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835` | Admin |
| CiretaFractionFactory | `0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42` | Admin |

### Compliance Modules (UUPS proxies)

| Contract | Address | Owner |
|----------|---------|-------|
| CountryAllowModule | `0xc3a2c6B72EDFf1E60be60969d80612809887c88e` | Admin |
| MaxHolderCountModule | `0x2C616041C8CEe744f238F4376cF18B81267Ec2B3` | Admin |

---

## Cross-Contract Wiring

| Reference | Set To |
|-----------|--------|
| SaleFactory.issuerRegistry | `0x48066cC2dE6A46561469cf2664b0BD9143aa448c` |
| SaleFactory.platformFeeManager | `0x7800bc250EbB8bf7d35767F7F3Afd2dCbed114f2` |
| SaleFactory.fractionFactory | `0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42` |
| TokenFactory.simpleIdentityMode | `true` |
| PlatformFeeManager.feeReceiver | `0x7C7fAF2473C43A8F02e70B93938e436FADeFfcbb` |
| PlatformFeeManager.defaultFeeBps | `200` (2%) |

---

## Contracts NOT Deployed (Simple Mode)

| Contract | Reason |
|----------|--------|
| IdentityRegistryStorage | Not needed — simple mode uses internal mapping |
| ClaimTopicsRegistry | Not needed — no claims |
| TrustedIssuersRegistry | Not needed — no claim issuers |
| IdentityRegistry (full) | Replaced by SimpleIdentityRegistry |
| OnchainID | Not needed — no per-investor identity contracts |
| OnchainIDFactory | Not needed |
| CiretaClaimIssuer | Not needed — no claim signing |

---

## Deployment File

Raw addresses saved at: `contracts/deployments/base-sepolia.json`
