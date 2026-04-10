// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../fraction/CiretaFractionToken1155.sol";
import "../interfaces/IIdentityRegistry.sol";

/// @title CiretaVault
/// @notice Holds ERC-3643 project tokens in escrow. Releases 1:1 when fraction
///         tokens are burned. Enforces per-investor vesting schedules.
contract CiretaVault is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums ---
    enum ExcessPolicy { Keep, BurnToMatch }

    // --- Structs ---
    struct VestingConfig {
        uint256 cliffDuration;
        uint256 vestingDuration;
    }

    /// @notice Round-5: per-id allocation tracking. Both ids share the same
    /// vesting schedule but track allocations + claims separately so the
    /// refund flow can act on USDC fractions only.
    struct InvestorVesting {
        uint256 totalUsdcFractions;
        uint256 totalOtcFractions;
        uint256 claimedUsdc;
        uint256 claimedOtc;
    }

    // --- State ---
    IERC20 public projectToken;
    CiretaFractionToken1155 public fractionToken;
    VestingConfig public vestingConfig;
    ExcessPolicy public excessPolicy;
    address public sale;
    address public issuer;
    bool public finalized;

    mapping(address => InvestorVesting) public investorVesting;

    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public vestingStartTime;

    // Round-5: identity registry reference for KYC re-verification at claim time
    IIdentityRegistry public identityRegistry;

    // Round-5: running counter of outstanding fractions across BOTH ids,
    // used by withdrawExcess to compute the issuer's claimable surplus.
    // Incremented in recordAllocation, decremented in claim.
    uint256 public totalOutstandingFractions;

    /// @dev Reserved storage gap for future upgrades
    uint256[48] private __gap;

    // --- Events ---
    event TokensLocked(uint256 amount);
    event TokensClaimed(address indexed investor, uint256 fractionsBurned, uint256 projectTokensReleased);
    event VestingStarted(uint256 timestamp);
    event ExcessReturned(uint256 amount, ExcessPolicy policy);
    event ExcessPolicyUpdated(ExcessPolicy oldPolicy, ExcessPolicy newPolicy);
    event IssuerExcessWithdrawn(address indexed issuer, uint256 amount);
    event FractionTokenSet(address fractionToken);

    // --- Errors ---
    error NotFinalized();
    error AlreadyFinalized();
    error NothingToClaim();
    error OnlySale();
    error OnlyIssuer();
    error ZeroAddress();
    error FractionTokenAlreadySet();
    error InvalidVestingConfig();
    error KYCRequired();
    error InvalidId();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _projectToken,
        address _fractionToken,
        address _identityRegistry,
        uint256 _cliffDuration,
        uint256 _vestingDuration,
        address _sale,
        address _issuer,
        ExcessPolicy _excessPolicy,
        address _owner
    ) public initializer {
        __Ownable_init(_owner);

        if (_projectToken == address(0)) revert ZeroAddress();
        if (_issuer == address(0)) revert ZeroAddress();
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_vestingDuration == 0 || _cliffDuration >= _vestingDuration) revert InvalidVestingConfig();

        projectToken = IERC20(_projectToken);
        fractionToken = CiretaFractionToken1155(_fractionToken);
        identityRegistry = IIdentityRegistry(_identityRegistry);
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
    //  SETUP (called by Sale contract or factory)
    // ──────────────────────────────────────────────

    /// @notice Set the fraction token address. Used by factory in two-step deploy
    ///         (vault deployed first with address(0), then fraction token set).
    function setFractionToken(address _fractionToken) external onlyOwner {
        if (address(fractionToken) != address(0)) revert FractionTokenAlreadySet();
        if (_fractionToken == address(0)) revert ZeroAddress();
        fractionToken = CiretaFractionToken1155(_fractionToken);
        emit FractionTokenSet(_fractionToken);
    }

    /// @notice Deposit project tokens into vault. Caller must approve first.
    function depositTokens(uint256 amount) external onlySale {
        projectToken.safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        emit TokensLocked(amount);
    }

    /// @notice Round-5: record an investor's allocation by id (1=USDC, 2=OTC).
    function recordAllocation(address investor, uint256 id, uint256 fractionAmount) external onlySale {
        if (id == 1) {
            investorVesting[investor].totalUsdcFractions += fractionAmount;
        } else if (id == 2) {
            investorVesting[investor].totalOtcFractions += fractionAmount;
        } else {
            revert InvalidId();
        }
        totalOutstandingFractions += fractionAmount;
    }

    /// @notice Mark sale as finalized, start vesting clock for all investors.
    function startVesting() external onlySale {
        if (finalized) revert AlreadyFinalized();
        finalized = true;
        vestingStartTime = block.timestamp;
        emit VestingStarted(block.timestamp);
    }

    /// @notice Handle excess project tokens between phases.
    function handlePhaseExcess(uint256 excessAmount) external onlySale {
        if (excessAmount == 0) return;

        if (excessPolicy == ExcessPolicy.BurnToMatch) {
            totalLocked -= excessAmount;
            projectToken.safeTransfer(issuer, excessAmount);
            emit ExcessReturned(excessAmount, ExcessPolicy.BurnToMatch);
        } else {
            emit ExcessReturned(excessAmount, ExcessPolicy.Keep);
        }
    }

    /// @notice Update excess policy. Only before finalization.
    function setExcessPolicy(ExcessPolicy _policy) external onlyOwner {
        if (finalized) revert AlreadyFinalized();
        ExcessPolicy old = excessPolicy;
        excessPolicy = _policy;
        emit ExcessPolicyUpdated(old, _policy);
    }

    /// @notice Issuer withdraws excess tokens after all fractions are settled.
    /// Round-5: uses totalOutstandingFractions counter (tracked across both
    /// ids in recordAllocation/claim) instead of querying the ERC-1155 supply.
    function withdrawExcess() external onlyIssuer nonReentrant {
        if (!finalized) revert NotFinalized();

        uint256 remainingLocked = totalLocked - totalReleased;
        if (remainingLocked <= totalOutstandingFractions) revert NothingToClaim();
        uint256 excess = remainingLocked - totalOutstandingFractions;

        totalLocked -= excess;
        projectToken.safeTransfer(issuer, excess);
        emit IssuerExcessWithdrawn(issuer, excess);
    }

    // ──────────────────────────────────────────────
    //  CLAIM (called by investor)
    // ──────────────────────────────────────────────

    /// @notice Round-5: investor claims vested project tokens. Releases both
    /// id-1 (USDC) and id-2 (OTC) fractions in a single call. Both ids share
    /// the same vesting schedule but are tracked separately.
    /// KYC re-verified at claim time (closes blind spot B6).
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();

        InvestorVesting storage iv = investorVesting[msg.sender];

        uint256 claimableUsdc = _calculateClaimable(iv.totalUsdcFractions, iv.claimedUsdc);
        uint256 claimableOtc  = _calculateClaimable(iv.totalOtcFractions, iv.claimedOtc);
        uint256 total = claimableUsdc + claimableOtc;
        if (total == 0) revert NothingToClaim();

        // Cap by actual ERC-1155 balances (in case fractions were burned via refund)
        if (claimableUsdc > 0) {
            uint256 bal = fractionToken.balanceOf(msg.sender, fractionToken.ID_USDC());
            if (claimableUsdc > bal) claimableUsdc = bal;
        }
        if (claimableOtc > 0) {
            uint256 bal = fractionToken.balanceOf(msg.sender, fractionToken.ID_OTC());
            if (claimableOtc > bal) claimableOtc = bal;
        }
        total = claimableUsdc + claimableOtc;
        if (total == 0) revert NothingToClaim();

        // Effects
        iv.claimedUsdc += claimableUsdc;
        iv.claimedOtc  += claimableOtc;
        totalReleased  += total;
        totalOutstandingFractions -= total;

        // Interactions: burn fractions, release project tokens
        if (claimableUsdc > 0) {
            fractionToken.burn(msg.sender, fractionToken.ID_USDC(), claimableUsdc);
        }
        if (claimableOtc > 0) {
            fractionToken.burn(msg.sender, fractionToken.ID_OTC(), claimableOtc);
        }
        projectToken.safeTransfer(msg.sender, total);

        emit TokensClaimed(msg.sender, total, total);
    }

    // ──────────────────────────────────────────────
    //  VIEW FUNCTIONS
    // ──────────────────────────────────────────────

    /// @notice How many project tokens can the investor claim right now (USDC + OTC).
    function getClaimable(address investor) public view returns (uint256) {
        if (!finalized) return 0;

        InvestorVesting storage iv = investorVesting[investor];
        uint256 claimableUsdc = _calculateClaimable(iv.totalUsdcFractions, iv.claimedUsdc);
        uint256 claimableOtc = _calculateClaimable(iv.totalOtcFractions, iv.claimedOtc);

        // Cap by actual ERC-1155 balances
        uint256 balUsdc = fractionToken.balanceOf(investor, fractionToken.ID_USDC());
        if (claimableUsdc > balUsdc) claimableUsdc = balUsdc;
        uint256 balOtc = fractionToken.balanceOf(investor, fractionToken.ID_OTC());
        if (claimableOtc > balOtc) claimableOtc = balOtc;

        return claimableUsdc + claimableOtc;
    }

    /// @notice Round-5: per-id breakdown of claimable amounts.
    function getClaimableByid(address investor) external view returns (uint256 usdc, uint256 otc) {
        if (!finalized) return (0, 0);
        InvestorVesting storage iv = investorVesting[investor];
        usdc = _calculateClaimable(iv.totalUsdcFractions, iv.claimedUsdc);
        otc = _calculateClaimable(iv.totalOtcFractions, iv.claimedOtc);
        uint256 balUsdc = fractionToken.balanceOf(investor, fractionToken.ID_USDC());
        if (usdc > balUsdc) usdc = balUsdc;
        uint256 balOtc = fractionToken.balanceOf(investor, fractionToken.ID_OTC());
        if (otc > balOtc) otc = balOtc;
    }

    /// @notice Total vested amount for investor (USDC + OTC fractions, sum).
    function getVested(address investor) external view returns (uint256) {
        if (!finalized) return 0;
        InvestorVesting storage iv = investorVesting[investor];
        return _calculateVested(iv.totalUsdcFractions + iv.totalOtcFractions);
    }

    // ──────────────────────────────────────────────
    //  INTERNAL
    // ──────────────────────────────────────────────

    /// @dev Linear-after-cliff vesting math, applied to a single fraction pool.
    function _calculateVested(uint256 totalFractions) internal view returns (uint256) {
        if (vestingStartTime == 0 || totalFractions == 0) return 0;
        uint256 elapsed = block.timestamp - vestingStartTime;
        if (elapsed < vestingConfig.cliffDuration) return 0;
        if (elapsed >= vestingConfig.vestingDuration) return totalFractions;
        return (totalFractions * elapsed) / vestingConfig.vestingDuration;
    }

    /// @dev Claimable = vested - already claimed for the given pool.
    function _calculateClaimable(uint256 totalFractions, uint256 claimed) internal view returns (uint256) {
        uint256 vested = _calculateVested(totalFractions);
        if (vested <= claimed) return 0;
        return vested - claimed;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
