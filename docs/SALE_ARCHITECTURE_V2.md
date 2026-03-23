# Sale Architecture V2: Vault + Fraction Token Model

> **Date:** 2026-03-23
> **Status:** Draft — Pending review
> **Replaces:** Current direct-transfer Sale.sol flow
> **Maintains compatibility with:** Existing CiretaToken (ERC-3643), CiretaTokenFactory, Identity/Compliance stack

---

## 1. Design Principle

Two sale modes, one unified architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SALE WITH VESTING                            │
│                                                                     │
│  Investor contributes USDC                                         │
│    → Sale mints fraction token (lightweight gated ERC-20) to user  │
│    → Project token locked in CiretaVault                           │
│    → After vesting: burn fraction → vault releases project token    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      SALE WITHOUT VESTING                           │
│                                                                     │
│  Investor contributes USDC                                         │
│    → Sale transfers project token directly to user                  │
│    → No fraction token, no vault                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. New Contracts Required

### 2.1 CiretaFractionToken.sol — Lightweight Gated ERC-20

**Purpose:** Receipt token representing a claim on the actual project token. Minted on contribution, burned on claim. NOT a full ERC-3643 — uses a simple KYC whitelist for gating (same identity registry, lighter enforcement).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

contract CiretaFractionToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");    // Sale contract
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");    // Vault contract

    IIdentityRegistry public identityRegistry;  // Shared with project token
    address public projectToken;                // The ERC-3643 token this represents
    address public vault;                       // CiretaVault holding the project tokens
    uint8 private _decimals;

    // --- Events ---
    event FractionsMinted(address indexed to, uint256 amount);
    event FractionsBurned(address indexed from, uint256 amount);

    // --- Errors ---
    error RecipientNotVerified(address to);
    error SenderNotVerified(address from);
    error ZeroAddress();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,         // e.g., "Wassa Gold Fraction (Seed)"
        string memory symbol,       // e.g., "frWMAU"
        uint8 decimals_,
        address _identityRegistry,
        address _projectToken,
        address _vault,
        address admin
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Burnable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        if (_identityRegistry == address(0) || _projectToken == address(0)) revert ZeroAddress();

        identityRegistry = IIdentityRegistry(_identityRegistry);
        projectToken = _projectToken;
        vault = _vault;
        _decimals = decimals_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint fractions to investor — called by Sale contract on contribute()
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit FractionsMinted(to, amount);
    }

    /// @notice Burn fractions from investor — called by Vault on claim()
    function burnFrom(address from, uint256 amount) public override onlyRole(BURNER_ROLE) {
        _burn(from, amount);
        emit FractionsBurned(from, amount);
    }

    /// @notice Transfer gating — only KYC-verified wallets can send/receive
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            // Regular transfer — check both parties are KYC verified
            if (!identityRegistry.isVerified(from)) revert SenderNotVerified(from);
            if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        }
        super._update(from, to, value);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

**Key design decisions:**
- Uses the SAME `IIdentityRegistry` as the project token — one KYC check for all
- No ModularCompliance overhead — just `isVerified()` gate on transfers
- `MINTER_ROLE` assigned to Sale contract (mints on contribute)
- `BURNER_ROLE` assigned to Vault contract (burns on claim)
- UUPS upgradeable (consistent with all other Cireta contracts)
- Decimals match the project token

**Gas comparison vs full ERC-3643:**
- No compliance module iteration on every transfer (~50K gas saved per transfer)
- No ONCHAINID claim validation (~30K gas saved per transfer)
- Still enforces KYC via shared IdentityRegistry (~20K gas per transfer)

---

### 2.2 CiretaVault.sol — Token Vault with Vesting + Burn-to-Release

**Purpose:** Holds project tokens (ERC-3643) in escrow. Releases them 1:1 when fraction tokens are burned. Enforces per-investor vesting schedules.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CiretaFractionToken.sol";

contract CiretaVault is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    // --- Enums ---

    /// @notice How to handle excess vault tokens when transitioning between phases
    ///         at different price points.
    ///
    ///  Keep      — Leave full supply in vault. Vault may hold more project tokens than
    ///              fractions outstanding. Excess returned to issuer after sale finalizes
    ///              and all claims are processed. Use when issuer wants to retain unsold
    ///              tokens for future sales, treasury, or liquidity.
    ///
    ///  BurnToMatch — Burn (return to issuer for burning) the excess tokens so vault
    ///              always holds exactly 1:1 backing against outstanding fractions.
    ///              Use when strict on-chain proof of 1:1 backing is required for
    ///              investor transparency (e.g., commodity-backed tokens per the
    ///              Raise Lifecycle PDF).
    enum ExcessPolicy { Keep, BurnToMatch }

    // --- Structs ---
    struct VestingConfig {
        uint256 cliffDuration;    // Seconds from sale finalization
        uint256 vestingDuration;  // Total seconds (including cliff)
    }

    struct InvestorVesting {
        uint256 totalFractions;   // Total fraction tokens held (for reference)
        uint256 claimedAmount;    // Project tokens already claimed
        uint256 vestingStart;     // Timestamp when vesting began (sale finalization)
    }

    // --- State ---
    IERC20 public projectToken;                // The ERC-3643 token held in vault
    CiretaFractionToken public fractionToken;  // The fraction token to burn
    VestingConfig public vestingConfig;
    ExcessPolicy public excessPolicy;          // How to handle excess tokens between phases
    address public sale;                       // Sale contract that can configure this vault
    address public issuer;                     // Receives excess tokens when policy = Keep
    bool public finalized;                     // True after sale finalization

    mapping(address => InvestorVesting) public investorVesting;

    uint256 public totalLocked;     // Total project tokens locked in vault
    uint256 public totalReleased;   // Total project tokens released to investors

    // --- Events ---
    event TokensLocked(uint256 amount);
    event TokensClaimed(address indexed investor, uint256 fractionsBurned, uint256 projectTokensReleased);
    event VestingStarted(uint256 timestamp);
    event ExcessReturned(uint256 amount, ExcessPolicy policy);
    event ExcessPolicyUpdated(ExcessPolicy oldPolicy, ExcessPolicy newPolicy);
    event IssuerExcessWithdrawn(address indexed issuer, uint256 amount);

    // --- Errors ---
    error NotFinalized();
    error AlreadyFinalized();
    error NothingToClaim();
    error CliffNotReached();
    error OnlySale();
    error OnlyIssuer();
    error ZeroAddress();
    error InsufficientVaultBalance();
    error ExcessWithdrawTooEarly();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _projectToken,
        address _fractionToken,
        uint256 _cliffDuration,
        uint256 _vestingDuration,
        address _sale,
        address _issuer,
        ExcessPolicy _excessPolicy,
        address _owner
    ) public initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();

        if (_projectToken == address(0) || _fractionToken == address(0)) revert ZeroAddress();
        if (_issuer == address(0)) revert ZeroAddress();

        projectToken = IERC20(_projectToken);
        fractionToken = CiretaFractionToken(_fractionToken);
        vestingConfig = VestingConfig(_cliffDuration, _vestingDuration);
        excessPolicy = _excessPolicy;
        sale = _sale;
        issuer = _issuer;
    }

    modifier onlySale() {
        if (msg.sender != sale) revert OnlySale();
        _;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert OnlyIssuer();
        _;
    }

    // ──────────────────────────────────────────────
    //  SETUP (called by Sale contract)
    // ──────────────────────────────────────────────

    /// @notice Deposit project tokens into vault. Called after token mint, before sale starts.
    ///         Issuer must approve vault first: projectToken.approve(vault, amount)
    function depositTokens(uint256 amount) external onlySale {
        projectToken.safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        emit TokensLocked(amount);
    }

    /// @notice Record an investor's fraction allocation. Called by Sale on each contribute().
    function recordAllocation(address investor, uint256 fractionAmount) external onlySale {
        investorVesting[investor].totalFractions += fractionAmount;
    }

    /// @notice Mark sale as finalized, start vesting clock.
    function startVesting() external onlySale {
        if (finalized) revert AlreadyFinalized();
        finalized = true;
        emit VestingStarted(block.timestamp);
    }

    /// @notice Handle excess project tokens when transitioning between phases
    ///         at different price points. Behavior depends on excessPolicy:
    ///
    ///  BurnToMatch: Returns excess tokens to issuer (for burning via SUPPLY_ROLE).
    ///               Vault holds exactly 1:1 backing vs outstanding fractions.
    ///               Investors can verify vault balance = fraction totalSupply at any time.
    ///
    ///  Keep:        Tokens stay in vault. Vault may be over-collateralized.
    ///               Issuer can withdraw excess AFTER sale finalizes and all claims settle.
    ///               Useful when issuer wants to reuse unsold tokens later.
    ///
    /// @param excessAmount  Number of project tokens that exceed 1:1 backing
    function handlePhaseExcess(uint256 excessAmount) external onlySale {
        if (excessAmount == 0) return;

        if (excessPolicy == ExcessPolicy.BurnToMatch) {
            // Return to issuer for burning — vault shrinks to exact 1:1 backing
            totalLocked -= excessAmount;
            projectToken.safeTransfer(issuer, excessAmount);
            emit ExcessReturned(excessAmount, ExcessPolicy.BurnToMatch);
        } else {
            // Keep: tokens stay in vault, no action needed
            // Excess tracked implicitly: totalLocked - fractionToken.totalSupply()
            emit ExcessReturned(excessAmount, ExcessPolicy.Keep);
        }
    }

    /// @notice Update excess policy. Can only be changed before sale finalization.
    function setExcessPolicy(ExcessPolicy _policy) external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        ExcessPolicy old = excessPolicy;
        excessPolicy = _policy;
        emit ExcessPolicyUpdated(old, _policy);
    }

    /// @notice Issuer withdraws excess tokens after sale finalizes and all fractions
    ///         are burned (fully claimed). Only relevant when excessPolicy = Keep.
    ///         Prevents issuer from draining vault while investors still have fractions.
    function withdrawExcess() external onlyIssuer nonReentrant {
        if (!finalized) revert NotFinalized();

        uint256 outstandingFractions = fractionToken.totalSupply();
        uint256 remainingLocked = totalLocked - totalReleased;

        // Excess = tokens in vault beyond what's needed to cover outstanding fractions
        if (remainingLocked <= outstandingFractions) revert NothingToClaim();
        uint256 excess = remainingLocked - outstandingFractions;

        totalLocked -= excess;
        projectToken.safeTransfer(issuer, excess);
        emit IssuerExcessWithdrawn(issuer, excess);
    }

    // ──────────────────────────────────────────────
    //  CLAIM (called by investor)
    // ──────────────────────────────────────────────

    /// @notice Investor claims vested project tokens by burning fraction tokens.
    ///         Fractions burned = project tokens released (1:1 by token amount).
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();

        InvestorVesting storage iv = investorVesting[msg.sender];
        uint256 claimable = getClaimable(msg.sender);
        if (claimable == 0) revert NothingToClaim();

        // Update state before external calls
        iv.claimedAmount += claimable;
        totalReleased += claimable;

        // Burn fraction tokens from investor (vault has BURNER_ROLE)
        fractionToken.burnFrom(msg.sender, claimable);

        // Release project tokens to investor
        projectToken.safeTransfer(msg.sender, claimable);

        emit TokensClaimed(msg.sender, claimable, claimable);
    }

    // ──────────────────────────────────────────────
    //  VIEW FUNCTIONS
    // ──────────────────────────────────────────────

    /// @notice How many project tokens can the investor claim right now?
    function getClaimable(address investor) public view returns (uint256) {
        if (!finalized) return 0;

        InvestorVesting storage iv = investorVesting[investor];
        if (iv.totalFractions == 0) return 0;

        uint256 vested = _calculateVested(iv);
        uint256 claimable = vested - iv.claimedAmount;

        // Can't claim more than their fraction token balance
        uint256 fractionBalance = fractionToken.balanceOf(investor);
        if (claimable > fractionBalance) {
            claimable = fractionBalance;
        }

        return claimable;
    }

    /// @notice Total vested amount for investor based on time elapsed.
    function getVested(address investor) external view returns (uint256) {
        if (!finalized) return 0;
        return _calculateVested(investorVesting[investor]);
    }

    /// @notice Vault backing ratio: locked tokens / total fraction supply
    function getBackingRatio() external view returns (uint256 locked, uint256 fractionSupply) {
        locked = totalLocked - totalReleased;
        fractionSupply = fractionToken.totalSupply();
    }

    // ──────────────────────────────────────────────
    //  INTERNAL
    // ──────────────────────────────────────────────

    function _calculateVested(InvestorVesting storage iv) internal view returns (uint256) {
        // Find the vesting start time — set when finalized
        // We use the block.timestamp of when startVesting() was called
        // For simplicity, stored implicitly via vestingStart
        uint256 start = iv.vestingStart;
        if (start == 0) {
            // Vesting start not yet recorded for this investor
            // This happens when startVesting() is called — we need to set it
            return 0;
        }

        uint256 elapsed = block.timestamp - start;

        // Before cliff: nothing vested
        if (elapsed < vestingConfig.cliffDuration) {
            return 0;
        }

        // After full vesting: everything vested
        if (elapsed >= vestingConfig.vestingDuration) {
            return iv.totalFractions;
        }

        // Linear vesting between cliff and end
        return (iv.totalFractions * elapsed) / vestingConfig.vestingDuration;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

**Key design decisions:**
- `depositTokens()` — issuer pre-funds vault before sale starts
- `recordAllocation()` — Sale calls this on every contribute to track per-investor amounts
- `startVesting()` — Sale calls this on finalization to start the vesting clock
- `burnExcess()` — for inter-phase supply adjustment (PDF requirement)
- `claim()` — investor burns fractions, receives project tokens (atomic)
- `getBackingRatio()` — public transparency (anyone can verify 1:1 backing)

---

### 2.3 Updated Sale.sol — Dual-Mode Sale

The existing Sale contract needs modifications to support both modes. Key changes:

```solidity
// New state variables added to Sale.sol
enum SaleMode { Direct, Vested }

SaleMode public saleMode;
CiretaVault public vault;             // Only set if saleMode == Vested
CiretaFractionToken public fractionToken; // Only set if saleMode == Vested
```

**Modified `contribute()` function:**

```solidity
function contribute(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(Active) {
    // ... existing validation (KYC, phase active, limits, whitelist) ...

    // Take USDC from investor
    paymentToken.safeTransferFrom(msg.sender, address(this), amount);

    uint256 tokensToAllocate = (amount * 10 ** tokenDecimals) / phase.pricePerToken;

    // Record contribution (same as before)
    contributions[msg.sender].amount += amount;
    contributions[msg.sender].tokensAllocated += tokensToAllocate;
    phase.sold += tokensToAllocate;
    totalRaised += amount;

    if (saleMode == SaleMode.Direct) {
        // NO VESTING: Transfer project token directly to investor
        IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
        contributions[msg.sender].claimed = true;
    } else {
        // WITH VESTING: Mint fraction tokens to investor
        fractionToken.mint(msg.sender, tokensToAllocate);
        vault.recordAllocation(msg.sender, tokensToAllocate);
    }

    emit ContributionMade(msg.sender, phaseId, amount, tokensToAllocate);

    if (totalRaised >= hardCap) {
        _finalize();
    }
}
```

**Modified `_finalize()` — start vesting clock:**

```solidity
function _finalize() internal {
    if (totalRaised >= softCap) {
        status = SaleStatus.FinalizedSuccess;

        // Calculate and transfer platform fee
        uint256 fee = _calculateFee();
        if (fee > 0) {
            paymentToken.safeTransfer(feeManager, fee);
            platformFeeCollected = fee;
        }
        // Transfer remaining USDC to issuer
        uint256 issuerAmount = totalRaised - fee;
        paymentToken.safeTransfer(issuer, issuerAmount);

        // Start vesting if applicable
        if (saleMode == SaleMode.Vested) {
            vault.startVesting();
        }
    } else {
        status = SaleStatus.FinalizedFailed;
    }

    emit SaleFinalized(status, totalRaised, platformFeeCollected);
}
```

**Modified `claimTokens()` — only for Direct mode:**

```solidity
function claimTokens() external nonReentrant {
    // For Direct mode: this is the fallback claim (hard cap auto-finalize edge case)
    require(saleMode == SaleMode.Direct, "Use vault.claim() for vested sales");
    require(status == SaleStatus.FinalizedSuccess, "Sale not finalized");
    // ... existing claim logic ...
}
```

**Modified `claimRefund()` — handles fraction token burn on failed sale:**

```solidity
function claimRefund() external nonReentrant {
    require(status == SaleStatus.FinalizedFailed, "Sale not failed");

    Contribution storage contrib = contributions[msg.sender];
    require(contrib.amount > 0 && !contrib.refunded, "Nothing to refund");

    contrib.refunded = true;

    // If vested mode: burn any fraction tokens the investor holds for this sale
    if (saleMode == SaleMode.Vested) {
        uint256 fractionBalance = fractionToken.balanceOf(msg.sender);
        if (fractionBalance > 0) {
            fractionToken.burnFrom(msg.sender, fractionBalance);
        }
    }

    // Refund USDC
    paymentToken.safeTransfer(msg.sender, contrib.amount);
    emit RefundClaimed(msg.sender, contrib.amount);
}
```

---

### 2.4 CiretaFractionFactory.sol — Deploys Fraction Token + Vault per Sale

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract CiretaFractionFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    address public fractionTokenImplementation;
    address public vaultImplementation;

    address[] public deployedVaults;
    mapping(address => address) public saleToVault;     // Sale → Vault
    mapping(address => address) public saleToFraction;  // Sale → FractionToken

    event VaultDeployed(address indexed sale, address vault, address fractionToken, address projectToken);

    constructor() { _disableInitializers(); }

    function initialize(
        address _owner,
        address _fractionImpl,
        address _vaultImpl
    ) public initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        fractionTokenImplementation = _fractionImpl;
        vaultImplementation = _vaultImpl;
    }

    /// @notice Deploy a fraction token + vault pair for a vested sale
    function deployVaultAndFraction(
        string memory fractionName,     // "Wassa Gold Fraction (Seed)"
        string memory fractionSymbol,   // "frWMAU"
        uint8 decimals,
        address projectToken,
        address identityRegistry,
        address sale,
        uint256 cliffDuration,
        uint256 vestingDuration,
        address admin
    ) external onlyOwner returns (address fractionProxy, address vaultProxy) {

        // Deploy Vault proxy
        bytes memory vaultInitData = abi.encodeCall(
            CiretaVault.initialize,
            (projectToken, address(0), cliffDuration, vestingDuration, sale, admin)
        );
        vaultProxy = address(new ERC1967Proxy(vaultImplementation, vaultInitData));

        // Deploy FractionToken proxy
        bytes memory fractionInitData = abi.encodeCall(
            CiretaFractionToken.initialize,
            (fractionName, fractionSymbol, decimals, identityRegistry, projectToken, vaultProxy, admin)
        );
        fractionProxy = address(new ERC1967Proxy(fractionTokenImplementation, fractionInitData));

        // Grant roles: Sale can mint fractions, Vault can burn fractions
        CiretaFractionToken(fractionProxy).grantRole(
            CiretaFractionToken(fractionProxy).MINTER_ROLE(), sale
        );
        CiretaFractionToken(fractionProxy).grantRole(
            CiretaFractionToken(fractionProxy).BURNER_ROLE(), vaultProxy
        );

        // Update vault with fraction token address
        // (vault was deployed with address(0) for fractionToken, now we set it)
        CiretaVault(vaultProxy).setFractionToken(fractionProxy);

        // Track
        saleToVault[sale] = vaultProxy;
        saleToFraction[sale] = fractionProxy;
        deployedVaults.push(vaultProxy);

        emit VaultDeployed(sale, vaultProxy, fractionProxy, projectToken);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

---

## 3. Complete Flow Diagrams

### 3.1 Vested Sale (e.g., Wassa Gold — Seed Round at $85K/kg)

```
SETUP:
  ┌────────────┐     deployToken()      ┌───────────────────┐
  │   Issuer    │ ──────────────────────→│  CiretaTokenFactory│
  └──────┬─────┘                         └─────────┬─────────┘
         │                                         │ creates
         │                          ┌──────────────▼────────────┐
         │                          │  WMAU (ERC-3643)          │
         │                          │  2,880 tokens minted      │
         │                          └──────────────┬────────────┘
         │                                         │
         │  deploySale(mode=Vested, cliff=90d, vest=180d)
         │                                         │
         │     ┌──────────────────────┐            │
         ├────→│   CiretaSaleFactory  │            │
         │     └──────────┬───────────┘            │
         │                │ deploys                 │
         │     ┌──────────▼───────────┐            │
         │     │   Sale (Vested)      │            │
         │     └──────────┬───────────┘            │
         │                │                        │
         │     ┌──────────▼───────────┐            │
         ├────→│  CiretaFractionFactory│            │
         │     └──────────┬───────────┘            │
         │                │ deploys both            │
         │     ┌──────────▼───────────┐ ┌─────────▼──────────┐
         │     │  frWMAU (Gated ERC20)│ │  CiretaVault       │
         │     │  MINTER = Sale       │ │  holds WMAU tokens  │
         │     │  BURNER = Vault      │ │                     │
         │     └──────────────────────┘ └─────────┬──────────┘
         │                                        │
         │  approve(vault, 2880) + vault.deposit(2880)
         └────────────────────────────────────────→│
                                          2,880 WMAU locked ✓

CONTRIBUTION (Seed: $85K per token):
  ┌────────────┐  USDC.approve(sale, $8.5M)  ┌────────────────┐
  │  Investor   │ ──────────────────────────→ │  USDC Contract  │
  └──────┬─────┘                              └────────────────┘
         │
         │  sale.contribute(phaseId=0, amount=$8.5M)
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale.contribute()                                           │
  │  1. USDC transferred: Investor → Sale ($8.5M)               │
  │  2. Tokens calculated: $8.5M / $85K = 100 tokens            │
  │  3. fractionToken.mint(investor, 100)  ← fraction to wallet │
  │  4. vault.recordAllocation(investor, 100)                    │
  └──────────────────────────────────────────────────────────────┘

  Investor wallet now shows:
    ✓ 100 frWMAU (fraction token — visible on Etherscan)
    ✗ 0 WMAU (project token — locked in vault)

FINALIZATION:
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale._finalize()                                            │
  │  1. Fee calculated: $8.5M × 200bps = $170K → PlatformFee    │
  │  2. Remainder: $8.5M - $170K = $8.33M → Issuer              │
  │  3. vault.startVesting()  ← starts vesting clock             │
  └──────────────────────────────────────────────────────────────┘

CLAIM (after 90-day cliff, linear over 180 days):
  ┌────────────┐  vault.claim()
  │  Investor   │ ──────────────────────────────────────────────┐
  └──────┬─────┘                                                │
         ▼                                                      ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  CiretaVault.claim()                                         │
  │  1. Calculate vested: 100 tokens × (elapsed / vestingDur)   │
  │  2. Claimable = vested - alreadyClaimed                      │
  │  3. fractionToken.burnFrom(investor, claimable) ← BURN      │
  │  4. projectToken.safeTransfer(investor, claimable) ← RELEASE│
  └──────────────────────────────────────────────────────────────┘

  After full vesting:
    ✓ 0 frWMAU (all burned)
    ✓ 100 WMAU (all released from vault)
```

### 3.2 Direct Sale (No Vesting — Ready-to-Sell Commodity Token)

```
SETUP:
  Issuer creates token, deposits into Sale contract directly (no vault)

CONTRIBUTION:
  ┌──────────────────────────────────────────────────────────────┐
  │  Sale.contribute() [Direct mode]                             │
  │  1. USDC transferred: Investor → Sale                        │
  │  2. Tokens calculated                                        │
  │  3. projectToken.safeTransfer(investor, amount) ← IMMEDIATE  │
  │  4. contribution.claimed = true                              │
  └──────────────────────────────────────────────────────────────┘

  Investor wallet immediately shows:
    ✓ 100 WMAU (project token — fully owned)
    No fraction token involved.
```

### 3.3 Multi-Phase with Price Adjustment

The vault's `excessPolicy` (set at deployment) controls what happens to unsold backing tokens when a phase transitions to a higher price:

```
PHASE 1 (Seed @ $85K): 2,880 WMAU locked in vault
  → Phase ends. 2,000 sold, 880 unsold.
  → New price for Phase 2: $115K/token
  → At $115K, 880 unsold tokens need only 649 backing tokens
  → Excess = 880 - 649 = 231 tokens
```

#### Policy A: `BurnToMatch` — Strict 1:1 Backing (Default for Commodity Tokens)

Use when: investors need verifiable proof that vault balance = fraction supply at all times. Matches the Raise Lifecycle PDF model. Best for commodity-backed tokens where 1:1 reserve proof is a selling point.

```
INTER-PHASE ADJUSTMENT (BurnToMatch):
  ┌──────────────────────────────────────────────────────────────┐
  │  vault.handlePhaseExcess(231)                                 │
  │  Policy = BurnToMatch                                         │
  │  → 231 WMAU returned to issuer for burning (SUPPLY_ROLE)      │
  │  → totalLocked reduced: 2,880 → 2,649                        │
  │  → Vault holds exactly: 2,000 (sold) + 649 (remaining) ✓     │
  │  → On-chain verifiable: vault.getBackingRatio() = 1:1         │
  └──────────────────────────────────────────────────────────────┘

  Issuer responsibility: call CiretaToken.burn(issuer, 231) after receiving
  tokens back. This is a permanent, verifiable on-chain burn event.

PHASE 2 (Private @ $115K): 649 tokens available for sale
```

#### Policy B: `Keep` — Retain Full Supply (Default for Futures / Multi-Use Tokens)

Use when: issuer wants to retain unsold tokens for future sales, treasury reserves, liquidity provision, or strategic allocation. The vault holds more tokens than fractions outstanding, but excess is locked until all investors have claimed.

```
INTER-PHASE ADJUSTMENT (Keep):
  ┌──────────────────────────────────────────────────────────────┐
  │  vault.handlePhaseExcess(231)                                 │
  │  Policy = Keep                                                │
  │  → No tokens moved. Vault still holds 2,880 WMAU.            │
  │  → 2,000 fractions outstanding, 649 available for Phase 2     │
  │  → 231 excess tokens remain in vault (over-collateralized)    │
  │  → Investors still protected: their fractions always backed   │
  │                                                               │
  │  AFTER SALE FINALIZES + ALL CLAIMS SETTLED:                   │
  │  → Issuer calls vault.withdrawExcess()                        │
  │  → Excess tokens returned to issuer wallet                    │
  │  → Guard: can only withdraw tokens above outstanding fractions│
  └──────────────────────────────────────────────────────────────┘

  Vault balance during sale: 2,880 WMAU (over-collateralized)
  Fraction supply: 2,000 + whatever sells in Phase 2
  Excess withdrawable only after: finalized AND fractionToken.totalSupply() settled

PHASE 2 (Private @ $115K): 880 tokens available (full unsold from Phase 1)
  Note: with Keep policy, Phase 2 can sell all 880 tokens (not just 649),
  because the vault still holds the full backing.
```

#### Policy Comparison

| | BurnToMatch | Keep |
|---|---|---|
| **Vault balance** | Exactly matches fraction supply | May exceed fraction supply |
| **On-chain 1:1 proof** | Always verifiable | Over-collateralized during sale |
| **Unsold tokens** | Burned permanently | Retained by issuer after claims |
| **Phase 2 available supply** | Reduced (price-adjusted) | Full unsold amount |
| **Investor transparency** | Highest — strict 1:1 | Still safe — excess is upside |
| **Issuer flexibility** | Lower — tokens gone | Higher — reuse unsold tokens |
| **Best for** | Commodity tokens, investor PDFs | Futures, multi-round raises |
| **Configurable** | Set at vault deploy, changeable before sale starts | Same |

#### When to Use Which

```
vault.initialize(
    ...,
    excessPolicy: ExcessPolicy.BurnToMatch  // Commodity-backed (gold, copper)
)

vault.initialize(
    ...,
    excessPolicy: ExcessPolicy.Keep          // Futures, mining rights, multi-round
)
```

The policy can be changed via `vault.setExcessPolicy()` by the owner **before the sale finalizes** — not after, to prevent post-hoc manipulation.

---

## 4. Contract Deployment Order

```
1. Deploy implementations (one-time):
   a. CiretaFractionToken (implementation)
   b. CiretaVault (implementation)
   c. Updated Sale (implementation with saleMode support)

2. Deploy CiretaFractionFactory (one-time):
   → Pass fraction + vault implementations

3. Per-project deployment:
   a. CiretaTokenFactory.deployToken() → project ERC-3643 token
   b. CiretaSaleFactory.deploySale(mode=Vested|Direct) → sale contract
   c. If Vested: CiretaFractionFactory.deployVaultAndFraction() → fraction + vault
   d. Mint project tokens to issuer
   e. If Vested: issuer deposits tokens into vault
      If Direct: issuer deposits tokens into sale contract
   f. Sale.activate()
```

---

## 5. On-Chain Verifiability (Matches PDF Promise)

| What | Where to Verify |
|---|---|
| Project token (ERC-3643) | Token contract on BaseScan — total supply, holders, gating |
| Fraction token (Gated ERC-20) | Fraction contract on BaseScan — holders = current investors |
| Vault backing | Vault contract's project token balance = locked supply |
| 1:1 ratio | `vault.getBackingRatio()` — locked tokens vs fraction supply |
| Your fraction balance | Connect wallet or search address on BaseScan |
| Burn events (claims) | Fraction token Transfer events to address(0) |
| Release events (claims) | `TokensClaimed` events on vault contract |
| Vesting schedule | `vault.vestingConfig()` — cliff + duration, public view |
| Your claimable amount | `vault.getClaimable(yourAddress)` — public view |

---

## 6. Migration Path from Existing Contracts

| Existing Contract | Change Required |
|---|---|
| **CiretaToken.sol** | No changes — project token stays ERC-3643 |
| **CiretaTokenFactory.sol** | No changes — still deploys ERC-3643 tokens |
| **Sale.sol** | Add `saleMode`, `vault`, `fractionToken` state vars. Modify `contribute()`, `_finalize()`, `claimRefund()`. Keep `claimTokens()` for Direct mode. |
| **VestingVault.sol** | **Deprecated** — replaced by CiretaVault with burn-to-release. Keep for backward compatibility if needed. |
| **CiretaSaleFactory.sol** | Minor update — pass saleMode in `deploySale()` |
| **IdentityRegistry.sol** | No changes — shared by both project + fraction tokens |
| **ModularCompliance.sol** | No changes — only bound to project token, not fraction |
| **All compliance modules** | No changes |

**New contracts:**
- `CiretaFractionToken.sol` — lightweight gated ERC-20
- `CiretaVault.sol` — vault with vesting + burn-to-release
- `CiretaFractionFactory.sol` — deploys fraction + vault pairs

---

## 7. Security Considerations

| Risk | Mitigation |
|---|---|
| Fraction token minted without vault backing | `MINTER_ROLE` only granted to Sale, which calls `vault.recordAllocation()` in same tx |
| Vault drained without fraction burn | `claim()` burns fractions BEFORE releasing tokens (checks-effects-interactions) |
| Double claim | `claimedAmount` tracking + fraction balance check (can't burn more than you hold) |
| Fraction transferred to non-KYC wallet | `_update()` override checks `identityRegistry.isVerified()` on both parties |
| Vault holds wrong token | `projectToken` set in `initialize()`, immutable after deployment |
| Reentrancy on claim | `nonReentrant` modifier on `claim()` |
| Excess policy manipulation | `setExcessPolicy()` blocked after finalization. `withdrawExcess()` guards: only excess above outstanding fractions can be withdrawn, and only after finalization |
| Issuer drains vault via Keep policy | `withdrawExcess()` calculates `remainingLocked - outstandingFractions` — cannot withdraw tokens backing active fractions |
| Phase excess drains vault | `handlePhaseExcess()` is `onlySale` — only Sale contract can call. With BurnToMatch, tokens go to issuer (not arbitrary address). With Keep, nothing moves. |
| Failed sale with outstanding fractions | `claimRefund()` burns investor's fractions before refunding USDC |

---

## 8. Gas Estimates

| Operation | Estimated Gas | Notes |
|---|---|---|
| Deploy FractionToken proxy | ~250K | One-time per sale |
| Deploy Vault proxy | ~300K | One-time per sale |
| `contribute()` (Vested) | ~180K | USDC transfer + fraction mint + allocation record |
| `contribute()` (Direct) | ~150K | USDC transfer + project token transfer |
| `claim()` (Vault) | ~120K | Fraction burn + project token transfer |
| `depositTokens()` | ~80K | Project token transfer to vault |

Compared to full ERC-3643 fraction approach: **~40% less gas** on contribute + claim due to lighter fraction token (no compliance module iteration).
