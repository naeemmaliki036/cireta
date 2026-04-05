# Cireta Contract Anatomy — SimpleIdentityRegistry vs ERC-3643 ONCHAINID

**Date:** 2026-04-03 01:45 UTC+4  
**Status:** Reference

---

## SimpleIdentityRegistry Mode (Whitelist)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLATFORM (deploy once)                              │
│                                                                             │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ IssuerRegistry   │  │ PlatformFeeManager│  │ CiretaTokenFactory       │  │
│  │                  │  │                  │  │  simpleIdentityMode=true │  │
│  │ isActiveIssuer() │  │ getFeeForIssuer()│  │  deployToken() →         │  │
│  │ ──────────────── │  │ calculateFee()   │  │    Token + SimpleIDReg   │  │
│  │ used by:         │  │ collectFee()     │  │    + ModularCompliance   │  │
│  │  SaleFactory     │  │ ──────────────── │  └──────────┬───────────────┘  │
│  └────────┬─────────┘  │ used by: Sale    │             │                  │
│           │            └────────┬─────────┘             │                  │
│           │                     │                       │                  │
│  ┌────────┴─────────────────────┴───────────────────────┴──────────────┐   │
│  │ CiretaSaleFactory                                                    │   │
│  │  deploySale(token, initData)           — onlyActiveIssuer           │   │
│  │  deploySaleVested(token, initData, ..) — onlyActiveIssuer           │   │
│  │  refs: IssuerRegistry, PlatformFeeManager, FractionFactory          │   │
│  └──────────────────────┬──────────────────────────────────────────────┘   │
│                          │                                                  │
│  ┌───────────────────────┴──────────────────────────┐                      │
│  │ CiretaFractionFactory (vested sales only)         │                      │
│  │  deployVaultAndFraction() → Vault + FractionToken │                      │
│  └───────────────────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┃ TokenFactory.deployToken()
                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PER-TOKEN TRIO (one per asset)                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ CiretaToken (UUPS proxy)                                            │   │
│  │  ERC-20 + ERC-3643 security token                                   │   │
│  │                                                                      │   │
│  │  Every transfer calls:                                               │   │
│  │    identityRegistry.isVerified(to) ──→ SimpleIdentityRegistry        │   │
│  │    compliance.canTransfer(from,to,amt) ──→ ModularCompliance         │   │
│  │                                                                      │   │
│  │  Roles: SUPPLY_ROLE (issuer only)                                    │   │
│  │         AGENT_ROLE, FREEZE_ROLE, RECOVERY_ROLE (issuer + admin)      │   │
│  └──────────┬────────────────────────────────┬──────────────────────────┘   │
│             │                                │                              │
│             ▼                                ▼                              │
│  ┌─────────────────────┐      ┌───────────────────────────────────┐        │
│  │ SimpleIdentity       │      │ ModularCompliance (UUPS proxy)    │        │
│  │ Registry              │      │                                   │        │
│  │ (UUPS proxy)         │      │  Attached modules:                │        │
│  │                      │      │   ├── WhitelistModule             │        │
│  │ isVerified(addr) =   │      │   ├── CountryAllowModule          │        │
│  │   whitelist[addr]    │      │   ├── MaxBalanceModule             │        │
│  │                      │      │   ├── MaxHolderCountModule         │        │
│  │ addToWhitelist()     │      │   └── ... (issuer's choice)       │        │
│  │ batchAddToWhitelist()│      │                                   │        │
│  │ removeFromWhitelist()│      │  canTransfer() loops ALL modules  │        │
│  │                      │      │  ANY module rejects → revert      │        │
│  │ Agent: backend       │      │  Owner: issuer                    │        │
│  │ (deployer wallet)    │      │                                   │        │
│  └──────────────────────┘      └───────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┃ SaleFactory.deploySale()
                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PER-SALE (one per offering)                               │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Sale.sol (UUPS proxy)                                                │   │
│  │                                                                      │   │
│  │  Refs:                                                               │   │
│  │   token ──────────→ CiretaToken (for Direct mode transfer)           │   │
│  │   paymentToken ───→ USDC (0x833589fCD6...)                          │   │
│  │   identityRegistry → SimpleIdentityRegistry (KYC check on buy)      │   │
│  │   factory ────────→ CiretaSaleFactory (admin = factory.owner())     │   │
│  │   feeManager ─────→ PlatformFeeManager (fee calc on finalize)       │   │
│  │                                                                      │   │
│  │  Status: DRAFT → ACTIVE → PAUSED → FINALIZED_SUCCESS/FAILED        │   │
│  │                                                                      │   │
│  │  buy(phaseId, amount):                                               │   │
│  │    1. Check identityRegistry.isVerified(msg.sender)                  │   │
│  │    2. Pull USDC from investor                                        │   │
│  │    3. DIRECT: token.transfer(investor, tokenAmount)                  │   │
│  │       VESTED: fractionToken.mint(investor, tokenAmount)              │   │
│  │                                                                      │   │
│  │  Issuer: addPhase, setWhitelist, withdrawFunds, finalize             │   │
│  │  Admin:  activate, unpause, emergencyWithdraw                        │   │
│  └──────────┬───────────────────────────────────────────────────────────┘   │
│             │                                                               │
│             │ (Vested mode only)                                            │
│             ▼                                                               │
│  ┌─────────────────────┐      ┌───────────────────────────────────┐        │
│  │ CiretaVault          │◄────►│ CiretaFractionToken              │        │
│  │                      │      │                                   │        │
│  │ Holds project tokens │      │ Receipt token (e.g. cCGLD)       │        │
│  │ cliff + vesting      │      │ Minted by Sale on buy()          │        │
│  │                      │      │ Burned by Vault on claim()       │        │
│  │ claim() → burn       │      │ KYC-gated transfers              │        │
│  │ fractions, release   │      │                                   │        │
│  │ vested tokens        │      │ MINTER: Sale                     │        │
│  │                      │      │ BURNER: Vault + Sale              │        │
│  │ Owner: issuer        │      │                                   │        │
│  └──────────────────────┘      └───────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘


BACKEND FLOW (Simple Mode):

  Sumsub KYC approved
        │
        ▼
  KYCService.handle_webhook()
        │
        ▼
  SimpleIdentityBridgeService.register_all_wallets(user_id)
        │
        ▼
  For each wallet:
    SimpleIdentityRegistry.addToWhitelist(wallet, countryCode)   ← ~50K gas
        │
        ▼
  Investor can now buy() on any Sale that uses this registry
```

---

## ERC-3643 ONCHAINID Mode (Full Compliance)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLATFORM (deploy once)                              │
│                                                                             │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ IssuerRegistry   │  │ PlatformFeeManager│  │ CiretaTokenFactory       │  │
│  │ isActiveIssuer() │  │ calculateFee()   │  │  simpleIdentityMode=false│  │
│  └─────────────────┘  └──────────────────┘  │  deployToken() →         │  │
│                                              │    Token + IdentityReg   │  │
│  ┌───────────────────────────────────────┐  │    + ModularCompliance   │  │
│  │ SHARED IDENTITY INFRASTRUCTURE        │  └──────────────────────────┘  │
│  │                                       │                                 │
│  │  ┌──────────────────────────────┐    │  ┌───────────────────────────┐  │
│  │  │ IdentityRegistryStorage      │    │  │ CiretaClaimIssuer         │  │
│  │  │  wallet → ONCHAINID mapping  │    │  │  claimSigner key loaded   │  │
│  │  │  shared across ALL tokens    │    │  │  isClaimValid() → ECDSA   │  │
│  │  │  bound to each token's       │    │  │  revokeClaim()            │  │
│  │  │  IdentityRegistry            │    │  │  setClaimSigner() rotate  │  │
│  │  └──────────────────────────────┘    │  └───────────────────────────┘  │
│  │                                       │                                 │
│  │  ┌──────────────────────────────┐    │  ┌───────────────────────────┐  │
│  │  │ ClaimTopicsRegistry          │    │  │ TrustedIssuersRegistry    │  │
│  │  │  topics: [1=KYC, 2=AML]     │    │  │  CiretaClaimIssuer is     │  │
│  │  │  "what claims are needed"    │    │  │  trusted for topics [1,2] │  │
│  │  └──────────────────────────────┘    │  │  "who can issue claims"   │  │
│  │                                       │  └───────────────────────────┘  │
│  │  ┌──────────────────────────────┐    │                                 │
│  │  │ OnchainIDFactory             │    │                                 │
│  │  │  deployIdentity(wallet)      │    │                                 │
│  │  │  → ONCHAINID proxy per user  │    │                                 │
│  │  └──────────────────────────────┘    │                                 │
│  └───────────────────────────────────────┘                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ CiretaSaleFactory + CiretaFractionFactory (same as simple mode)      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┃ TokenFactory.deployToken()
                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PER-TOKEN TRIO (one per asset)                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ CiretaToken (UUPS proxy)                                            │   │
│  │  IDENTICAL contract to simple mode                                   │   │
│  │                                                                      │   │
│  │  Every transfer calls:                                               │   │
│  │    identityRegistry.isVerified(to) ──→ IdentityRegistry (full)      │   │
│  │    compliance.canTransfer(from,to,amt) ──→ ModularCompliance         │   │
│  └──────────┬────────────────────────────────┬──────────────────────────┘   │
│             │                                │                              │
│             ▼                                ▼                              │
│  ┌──────────────────────────┐  ┌───────────────────────────────────┐       │
│  │ IdentityRegistry          │  │ ModularCompliance                 │       │
│  │ (UUPS proxy)              │  │ (same as simple mode)             │       │
│  │                           │  └───────────────────────────────────┘       │
│  │ isVerified(addr):         │                                              │
│  │  ┌─────────────────────┐ │                                              │
│  │  │ 1. Get ONCHAINID    │ │                                              │
│  │  │    from Storage      │──→ IdentityRegistryStorage.storedIdentity()   │
│  │  │                     │ │                                              │
│  │  │ 2. Get required     │ │                                              │
│  │  │    topics            │──→ ClaimTopicsRegistry.getClaimTopics()       │
│  │  │    → [1, 2]         │ │    → [KYC, AML]                             │
│  │  │                     │ │                                              │
│  │  │ 3. For each topic:  │ │                                              │
│  │  │    get claims from  │ │                                              │
│  │  │    ONCHAINID         │──→ OnchainID.getClaimIdsByTopic(1)            │
│  │  │                     │ │   OnchainID.getClaim(claimId)                │
│  │  │ 4. Verify issuer    │ │     → (topic, scheme, issuer, sig, data)     │
│  │  │    is trusted        │──→ TrustedIssuersRegistry.isTrustedIssuer()   │
│  │  │                     │ │   TrustedIssuersRegistry.hasClaimTopic()     │
│  │  │ 5. Verify signature │ │                                              │
│  │  │                     │──→ CiretaClaimIssuer.isClaimValid()            │
│  │  │                     │ │     → ECDSA recover → matches claimSigner?   │
│  │  │                     │ │     → signature not revoked?                  │
│  │  │                     │ │                                              │
│  │  │ ALL pass → true     │ │                                              │
│  │  │ ANY fail → false    │ │                                              │
│  │  └─────────────────────┘ │                                              │
│  └──────────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┃ Per investor (after KYC)
                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PER-USER (one ONCHAINID per investor)                     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ OnchainID (UUPS proxy) — ERC-734/735                                 │   │
│  │  Owner: investor's wallet                                            │   │
│  │                                                                      │   │
│  │  Claims stored:                                                      │   │
│  │   ┌────────────────────────────────────────────────────────────────┐ │   │
│  │   │ Topic 1 (KYC)                                                  │ │   │
│  │   │   issuer: CiretaClaimIssuer                                    │ │   │
│  │   │   signature: ECDSA(keccak256(identity,1,data), CLAIM_SIGNER)  │ │   │
│  │   │   data: KYC verification payload                               │ │   │
│  │   └────────────────────────────────────────────────────────────────┘ │   │
│  │   ┌────────────────────────────────────────────────────────────────┐ │   │
│  │   │ Topic 2 (AML)                                                  │ │   │
│  │   │   issuer: CiretaClaimIssuer                                    │ │   │
│  │   │   signature: ECDSA(keccak256(identity,2,data), CLAIM_SIGNER)  │ │   │
│  │   │   data: AML verification payload                               │ │   │
│  │   └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │  Registered in IdentityRegistryStorage:                              │   │
│  │    wallet_1 → this ONCHAINID                                        │   │
│  │    wallet_2 → this ONCHAINID  (same investor, multiple wallets)     │   │
│  │    wallet_3 → this ONCHAINID                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┃ Sale is IDENTICAL in both modes
                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PER-SALE (same structure as simple mode)                  │
│                                                                             │
│  Sale.sol → calls identityRegistry.isVerified(buyer)                       │
│             doesn't care which registry impl is behind it                   │
│                                                                             │
│  (Vault + FractionToken for vested — same as simple mode)                  │
└─────────────────────────────────────────────────────────────────────────────┘


BACKEND FLOW (ERC-3643 Mode):

  Sumsub KYC approved
        │
        ▼
  KYCService.handle_webhook()
        │
        ▼
  IdentityBridgeService.provision_identity(user_id)
        │
        ├── 1. OnchainIDFactory.deployIdentity(wallet)        ← ~1.9M gas
        │       → returns ONCHAINID proxy address
        │
        ├── 2. Sign KYC claim with CLAIM_SIGNER_PRIVATE_KEY
        │       sig = ECDSA(keccak256(identity, topic=1, data))
        │
        ├── 3. ONCHAINID.addClaim(topic=1, issuer, sig, data) ← ~200K gas
        │
        ├── 4. Sign AML claim, addClaim(topic=2, ...)          ← ~200K gas
        │
        └── 5. For each linked wallet:
                IdentityRegistryStorage
                  .addIdentityToStorage(wallet, ONCHAINID, country)  ← ~80K gas
        │
        ▼
  Investor can now buy() on any Sale — isVerified() checks claims
```

---

## Key Relationship: What stays the SAME between modes

```
                 SIMPLE MODE                    ERC-3643 MODE
                 ──────────                     ─────────────
CiretaToken      ✅ same contract               ✅ same contract
Sale.sol         ✅ same contract               ✅ same contract
ModularCompliance ✅ same contract              ✅ same contract
CiretaVault      ✅ same contract               ✅ same contract
FractionToken    ✅ same contract               ✅ same contract
IssuerRegistry   ✅ same contract               ✅ same contract
PlatformFeeManager ✅ same contract             ✅ same contract
All Factories    ✅ same contracts              ✅ same contracts
Frontend         ✅ no changes                  ✅ no changes
Sale buy() flow  ✅ identical                   ✅ identical

                 WHAT DIFFERS
                 ────────────
Identity check:  whitelist[addr]               claim verification chain
Backend service: SimpleIdentityBridgeService   IdentityBridgeService
Gas per investor: ~50K                         ~1.9M
Per-user contract: none                        OnchainID proxy
Config:          IDENTITY_MODE=simple          IDENTITY_MODE=erc3643
Extra keys:      none                          CLAIM_SIGNER_PRIVATE_KEY
Extra contracts: none                          6 identity contracts
```

The entire design pivots on one interface — `IIdentityRegistry.isVerified(address)`. Both registries implement it. The token and sale never know which mode is active.
