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
///         tokens are burned. Balance-based claim: whoever holds fractions at
///         claim time receives the vested project tokens. No per-buyer entitlement.
contract CiretaVault is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums ---
    enum ExcessPolicy { Keep, BurnToMatch }

    // --- Structs ---
    struct VestingConfig {
        uint256 cliffDuration;
        uint256 vestingDuration;
    }

    // --- State ---
    IERC20 public projectToken;
    CiretaFractionToken1155 public fractionToken;
    VestingConfig public vestingConfig;
    ExcessPolicy public excessPolicy;
    address public sale;
    address public issuer;
    bool public finalized;

    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public vestingStartTime;

    IIdentityRegistry public identityRegistry;

    /// @notice Total fractions minted across both IDs (incremented by recordAllocation).
    uint256 public totalMintedFractions;

    /// @notice Per-holder claimed amount (across both IDs). Keyed on current holder,
    /// not original buyer — supports transferred fractions.
    mapping(address => uint256) public claimedByHolder;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[100] private __gap;

    // --- Events ---
    event TokensLocked(uint256 amount);
    event TokensClaimed(address indexed investor, uint256 fractionsBurned, uint256 projectTokensReleased);
    event VestingStarted(uint256 timestamp);
    event ExcessReturned(uint256 amount, ExcessPolicy policy);
    event ExcessPolicyUpdated(ExcessPolicy oldPolicy, ExcessPolicy newPolicy);
    event IssuerExcessWithdrawn(address indexed issuer, uint256 amount);
    event FractionTokenSet(address fractionToken);
    /// @notice Emitted on every Sale-driven fraction mint. Indexers reconstruct
    /// the outstanding-fraction balance from these events without replaying
    /// every Sale.buy().
    event AllocationRecorded(uint256 indexed id, uint256 fractionAmount, uint256 newTotal);
    /// @notice Emitted when fractions are burned outside of claim() (e.g. refund).
    event MintedFractionsDecremented(uint256 amount, uint256 newTotal);
    /// @notice Emitted on every UUPS upgrade. The proxy also emits ERC1967
    /// `Upgraded(impl)`; this adds the nonce so monitors can distinguish
    /// the upgrade sequence.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

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
        // cliff == vesting is valid: lock-up-only variant (all tokens unlock at once at t=start+cliff).
        // cliff > vesting is the only truly invalid configuration.
        if (_vestingDuration == 0 || _cliffDuration > _vestingDuration) revert InvalidVestingConfig();

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

    /// @notice Record a fraction mint. Only tracks the global total — no per-investor
    /// bookkeeping because fractions are transferable (claim reads live balances).
    function recordAllocation(address, uint256 id, uint256 fractionAmount) external onlySale {
        if (id != 1 && id != 2) revert InvalidId();
        totalMintedFractions += fractionAmount;
        emit AllocationRecorded(id, fractionAmount, totalMintedFractions);
    }

    /// @notice Decrement minted counter when fractions are burned outside of claim
    /// (e.g. refund burns ID=1). Keeps withdrawExcess accounting correct.
    function decrementMinted(uint256 amount) external onlySale {
        totalMintedFractions -= amount;
        emit MintedFractionsDecremented(amount, totalMintedFractions);
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
    /// outstanding = totalMintedFractions (decremented by claim + decrementMinted).
    function withdrawExcess() external onlyIssuer nonReentrant {
        if (!finalized) revert NotFinalized();

        uint256 remainingLocked = totalLocked - totalReleased;
        if (remainingLocked <= totalMintedFractions) revert NothingToClaim();
        uint256 excess = remainingLocked - totalMintedFractions;

        totalLocked -= excess;
        projectToken.safeTransfer(issuer, excess);
        emit IssuerExcessWithdrawn(issuer, excess);
    }

    // ──────────────────────────────────────────────
    //  CLAIM (called by investor)
    // ──────────────────────────────────────────────

    /// @notice Claim vested project tokens. Burns fractions (both IDs) from caller
    /// and releases project tokens 1:1. Balance-based: whoever holds fractions at
    /// claim time receives the underlying. KYC re-verified at claim time.
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();

        uint256 balUsdc = fractionToken.balanceOf(msg.sender, fractionToken.ID_USDC());
        uint256 balOtc  = fractionToken.balanceOf(msg.sender, fractionToken.ID_OTC());
        uint256 totalHeld = balUsdc + balOtc;
        if (totalHeld == 0) revert NothingToClaim();

        // Effective balance includes already-claimed fractions (which were burned).
        // This ensures multi-claim works: vesting % applied to original effective
        // balance, minus what's already been claimed.
        uint256 claimed = claimedByHolder[msg.sender];
        uint256 effectiveBalance = totalHeld + claimed;
        uint256 vested = _calculateVested(effectiveBalance);
        if (vested <= claimed) revert NothingToClaim();
        uint256 claimable = vested - claimed;

        // Split burn pro-rata across both IDs
        uint256 burnUsdc;
        uint256 burnOtc;
        if (balUsdc >= claimable) {
            burnUsdc = claimable;
        } else {
            burnUsdc = balUsdc;
            burnOtc = claimable - balUsdc;
        }

        // Effects
        claimedByHolder[msg.sender] += claimable;
        totalMintedFractions -= claimable;
        totalReleased += claimable;

        // Interactions: burn fractions, release project tokens
        if (burnUsdc > 0) {
            fractionToken.burn(msg.sender, fractionToken.ID_USDC(), burnUsdc);
        }
        if (burnOtc > 0) {
            fractionToken.burn(msg.sender, fractionToken.ID_OTC(), burnOtc);
        }
        projectToken.safeTransfer(msg.sender, claimable);

        emit TokensClaimed(msg.sender, claimable, claimable);
    }

    // ──────────────────────────────────────────────
    //  VIEW FUNCTIONS
    // ──────────────────────────────────────────────

    /// @notice How many project tokens can the holder claim right now.
    /// Balance-based: reads current ERC-1155 holdings, not stored allocations.
    function getClaimable(address holder) public view returns (uint256) {
        if (!finalized) return 0;
        uint256 totalHeld = fractionToken.balanceOf(holder, fractionToken.ID_USDC())
                          + fractionToken.balanceOf(holder, fractionToken.ID_OTC());
        if (totalHeld == 0) return 0;
        uint256 claimed = claimedByHolder[holder];
        uint256 effectiveBalance = totalHeld + claimed;
        uint256 vested = _calculateVested(effectiveBalance);
        return vested > claimed ? vested - claimed : 0;
    }

    /// @notice Per-id breakdown of claimable amounts (proportional to balance ratio).
    function getClaimableById(address holder) external view returns (uint256 usdc, uint256 otc) {
        if (!finalized) return (0, 0);
        uint256 balUsdc = fractionToken.balanceOf(holder, fractionToken.ID_USDC());
        uint256 balOtc  = fractionToken.balanceOf(holder, fractionToken.ID_OTC());
        uint256 totalHeld = balUsdc + balOtc;
        if (totalHeld == 0) return (0, 0);
        uint256 claimable = getClaimable(holder);
        if (claimable == 0) return (0, 0);
        usdc = (claimable * balUsdc) / totalHeld;
        otc  = claimable - usdc;
    }

    /// @notice Total vested amount for holder (effective balance = held + claimed).
    function getVested(address holder) external view returns (uint256) {
        if (!finalized) return 0;
        uint256 totalHeld = fractionToken.balanceOf(holder, fractionToken.ID_USDC())
                          + fractionToken.balanceOf(holder, fractionToken.ID_OTC());
        uint256 claimed = claimedByHolder[holder];
        return _calculateVested(totalHeld + claimed);
    }

    // ──────────────────────────────────────────────
    //  INTERNAL
    // ──────────────────────────────────────────────

    /// @dev Vesting math applied to a fraction balance. Supports two variants:
    ///      - Cliff + linear: cliffDuration < vestingDuration. Zero until cliff,
    ///        then linearly grows to full at vestingDuration.
    ///      - Lock-up only:   cliffDuration == vestingDuration. Zero until D,
    ///        then 100 % unlocks at once. The cliff == vesting branch is an
    ///        explicit short-circuit so the division below is never reached with
    ///        a zero denominator.
    function _calculateVested(uint256 balance) internal view returns (uint256) {
        if (vestingStartTime == 0 || balance == 0) return 0;
        uint256 elapsed = block.timestamp - vestingStartTime;
        if (elapsed < vestingConfig.cliffDuration) return 0;
        // Lock-up-only variant (cliff == vesting) and fully-vested case both return
        // the full balance. Placing the cliff == vesting check here also guarantees
        // the linear branch below never executes with a zero denominator.
        if (elapsed >= vestingConfig.vestingDuration || vestingConfig.cliffDuration == vestingConfig.vestingDuration) {
            return balance;
        }
        // Linear vesting between cliff end and vesting end.
        // denominator = vestingDuration - cliffDuration > 0 (guarded by initialize).
        uint256 linearElapsed = elapsed - vestingConfig.cliffDuration;
        uint256 linearDuration = vestingConfig.vestingDuration - vestingConfig.cliffDuration;
        return (balance * linearElapsed) / linearDuration;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        upgradeNonce++;
        emit ImplementationUpgraded(newImplementation, upgradeNonce);
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "5.1.0"; }
}
