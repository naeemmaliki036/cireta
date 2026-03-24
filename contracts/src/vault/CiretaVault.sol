// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../fraction/CiretaFractionToken.sol";

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

    struct InvestorVesting {
        uint256 totalFractions;
        uint256 claimedAmount;
        uint256 vestingStart;
    }

    // --- State ---
    IERC20 public projectToken;
    CiretaFractionToken public fractionToken;
    VestingConfig public vestingConfig;
    ExcessPolicy public excessPolicy;
    address public sale;
    address public issuer;
    bool public finalized;

    mapping(address => InvestorVesting) public investorVesting;

    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public vestingStartTime;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

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

        if (_projectToken == address(0)) revert ZeroAddress();
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
    //  SETUP (called by Sale contract or factory)
    // ──────────────────────────────────────────────

    /// @notice Set the fraction token address. Used by factory in two-step deploy
    ///         (vault deployed first with address(0), then fraction token set).
    function setFractionToken(address _fractionToken) external onlyOwner {
        if (address(fractionToken) != address(0)) revert FractionTokenAlreadySet();
        if (_fractionToken == address(0)) revert ZeroAddress();
        fractionToken = CiretaFractionToken(_fractionToken);
        emit FractionTokenSet(_fractionToken);
    }

    /// @notice Deposit project tokens into vault. Caller must approve first.
    function depositTokens(uint256 amount) external onlySale {
        projectToken.safeTransferFrom(msg.sender, address(this), amount);
        totalLocked += amount;
        emit TokensLocked(amount);
    }

    /// @notice Record an investor's fraction allocation. Called by Sale on each contribute().
    function recordAllocation(address investor, uint256 fractionAmount) external onlySale {
        investorVesting[investor].totalFractions += fractionAmount;
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
    function withdrawExcess() external onlyIssuer nonReentrant {
        if (!finalized) revert NotFinalized();

        uint256 outstandingFractions = fractionToken.totalSupply();
        uint256 remainingLocked = totalLocked - totalReleased;

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
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();

        InvestorVesting storage iv = investorVesting[msg.sender];
        uint256 claimable = getClaimable(msg.sender);
        if (claimable == 0) revert NothingToClaim();

        // CEI: update state before external calls
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

    /// @notice Vault backing ratio: locked tokens / total fraction supply.
    function getBackingRatio() external view returns (uint256 locked, uint256 fractionSupply) {
        locked = totalLocked - totalReleased;
        fractionSupply = fractionToken.totalSupply();
    }

    // ──────────────────────────────────────────────
    //  INTERNAL
    // ──────────────────────────────────────────────

    function _calculateVested(InvestorVesting storage iv) internal view returns (uint256) {
        // Use per-investor vestingStart if set, otherwise global vestingStartTime
        uint256 start = iv.vestingStart != 0 ? iv.vestingStart : vestingStartTime;
        if (start == 0) return 0;

        uint256 elapsed = block.timestamp - start;

        if (elapsed < vestingConfig.cliffDuration) {
            return 0;
        }

        if (elapsed >= vestingConfig.vestingDuration) {
            return iv.totalFractions;
        }

        return (iv.totalFractions * elapsed) / vestingConfig.vestingDuration;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
