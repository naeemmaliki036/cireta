// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../fraction/CiretaFractionToken.sol";
import "../vault/CiretaVault.sol";

/// @title Sale
/// @notice Multi-phase token sale with soft/hard cap, platform fee, OTC allocation, and refunds.
contract Sale is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SaleStatus { Draft, Active, Paused, FinalizedSuccess, FinalizedFailed }
    enum SaleMode { Direct, Vested }

    struct Phase {
        string name;
        uint256 pricePerToken;
        uint256 allocation;
        uint256 sold;
        uint256 minContribution;
        uint256 maxContribution;
        uint256 startTime;
        uint256 endTime;
        bool whitelistOnly;
    }

    struct Contribution {
        uint256 amount;           // USDC contributed on-platform
        uint256 tokensAllocated;  // Tokens to receive
        bool claimed;
        bool refunded;
        bool isOtc;               // True = off-platform OTC allocation
    }

    // ── State ────────────────────────────────────────────────────────────────
    address public token;
    IERC20 public paymentToken;
    IIdentityRegistry public identityRegistry;
    address public issuer;
    address public feeManager;

    uint256 public softCap;
    uint256 public hardCap;
    uint256 public feeBasisPoints;   // e.g. 250 = 2.5%
    uint256 public feeCapUsdc;       // Absolute max fee in USDC (6 decimals)

    uint256 public totalRaised;              // Total USDC raised (on-platform only)
    uint256 public totalOtcAllocated;        // Total OTC token allocation (excluded from fee)
    uint256 public platformFeeCollected;

    SaleStatus public status;
    Phase[] public phases;

    mapping(uint256 => mapping(address => bool)) public whitelisted;
    mapping(address => Contribution) public contributions;
    mapping(address => uint256) public totalContributed;
    mapping(address => uint256) public otcAllocations;

    /// @notice Per-block contribution limit to mitigate front-running attacks.
    /// @dev Prevents a single block from accumulating excessive USDC contributions,
    ///      making sandwich attacks and MEV extraction uneconomical. Configurable via
    ///      setMaxPerBlock(). Default: 50,000 USDC. For additional protection, issuers
    ///      can: (1) lower maxPerBlock for high-value phases, (2) use whitelist-only
    ///      phases, and (3) coordinate with block builders for private transactions.
    ///      A commit-reveal scheme was considered but rejected due to UX complexity
    ///      and the sufficient protection provided by per-block limits + KYC gating.
    uint256 public maxPerBlock;
    mapping(uint256 => uint256) private _blockContributions;

    // ── Vested mode state ─────────────────────────────────────────────────────
    SaleMode public saleMode;
    CiretaVault public vault;
    CiretaFractionToken public fractionToken;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // ── Events ───────────────────────────────────────────────────────────────
    event PhaseAdded(uint256 indexed phaseId, string name, uint256 pricePerToken);
    event ContributionMade(address indexed contributor, uint256 indexed phaseId, uint256 amount, uint256 tokensAllocated);
    event OTCAllocation(address indexed investor, uint256 tokensAllocated, string paymentReference);
    event TokensClaimed(address indexed claimer, uint256 amount);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event SaleFinalized(bool success, uint256 totalRaised, uint256 platformFee);
    event SaleStatusChanged(SaleStatus newStatus);

    // ── Errors ───────────────────────────────────────────────────────────────
    error InvalidStatus();
    error NotIssuer();
    error ZeroAddress();
    error NothingToClaim();
    error AlreadyClaimed();
    error UseVaultClaim();
    error InvalidPhase();
    error PhaseNotStarted();
    error PhaseEnded();
    error BelowMinContribution();
    error ExceedsMaxContribution();
    error ExceedsHardCap();
    error ExceedsBlockLimit();
    error KYCRequired();
    error NotWhitelisted();
    error ExceedsAllocation();
    error CannotAddPhase();
    error ZeroMaxPerBlock();
    error SaleNotActive();
    error InvestorNotVerified();
    error CannotFinalize();

    modifier onlyStatus(SaleStatus s) {
        if (status != s) revert InvalidStatus();
        _;
    }
    modifier onlyIssuerOrOwner() {
        if (msg.sender != issuer && msg.sender != owner()) revert NotIssuer();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _token,
        address _paymentToken,
        address _identityRegistry,
        address _issuer,
        address _feeManager,
        uint256 _softCap,
        uint256 _hardCap,
        uint256 _feeBasisPoints,
        uint256 _feeCapUsdc
    ) external initializer {
        if (_token == address(0)) revert ZeroAddress();
        if (_paymentToken == address(0)) revert ZeroAddress();
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_issuer == address(0)) revert ZeroAddress();
        if (_feeManager == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);

        token = _token;
        paymentToken = IERC20(_paymentToken);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        issuer = _issuer;
        feeManager = _feeManager;
        softCap = _softCap;
        hardCap = _hardCap;
        feeBasisPoints = _feeBasisPoints;
        feeCapUsdc = _feeCapUsdc;
        maxPerBlock = 50_000 * 1e6; // 50,000 USDC default per-block cap
        status = SaleStatus.Draft;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── Admin ────────────────────────────────────────────────────────────────

    function activate() external onlyOwner onlyStatus(SaleStatus.Draft) {
        status = SaleStatus.Active;
        emit SaleStatusChanged(SaleStatus.Active);
    }

    function pause() external onlyOwner onlyStatus(SaleStatus.Active) {
        status = SaleStatus.Paused;
        emit SaleStatusChanged(SaleStatus.Paused);
    }

    function unpause() external onlyOwner onlyStatus(SaleStatus.Paused) {
        status = SaleStatus.Active;
        emit SaleStatusChanged(SaleStatus.Active);
    }

    function addPhase(
        string calldata name,
        uint256 pricePerToken,
        uint256 allocation,
        uint256 minContribution,
        uint256 maxContribution,
        uint256 startTime,
        uint256 endTime,
        bool whitelistOnly
    ) external onlyOwner {
        if (status != SaleStatus.Draft && status != SaleStatus.Active) revert CannotAddPhase();
        phases.push(Phase({
            name: name,
            pricePerToken: pricePerToken,
            allocation: allocation,
            sold: 0,
            minContribution: minContribution,
            maxContribution: maxContribution,
            startTime: startTime,
            endTime: endTime,
            whitelistOnly: whitelistOnly
        }));
        emit PhaseAdded(phases.length - 1, name, pricePerToken);
    }

    function setWhitelist(uint256 phaseId, address[] calldata addresses, bool allow) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[phaseId][addresses[i]] = allow;
        }
    }

    function setMaxPerBlock(uint256 _maxPerBlock) external onlyOwner {
        if (_maxPerBlock == 0) revert ZeroMaxPerBlock();
        maxPerBlock = _maxPerBlock;
    }

    /// @notice Configure vested mode. Must be called before activation.
    ///         Sets sale mode to Vested and links vault + fraction token.
    function setVestedMode(address _vault, address _fractionToken) external onlyOwner onlyStatus(SaleStatus.Draft) {
        if (_vault == address(0) || _fractionToken == address(0)) revert ZeroAddress();
        saleMode = SaleMode.Vested;
        vault = CiretaVault(_vault);
        fractionToken = CiretaFractionToken(_fractionToken);
    }

    // ── Contribute ───────────────────────────────────────────────────────────

    function contribute(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(SaleStatus.Active) {
        // ── Checks ──
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage phase = phases[phaseId];
        if (block.timestamp < phase.startTime) revert PhaseNotStarted();
        if (block.timestamp > phase.endTime) revert PhaseEnded();
        if (amount < phase.minContribution) revert BelowMinContribution();
        if (totalContributed[msg.sender] + amount > phase.maxContribution) revert ExceedsMaxContribution();
        if (totalRaised + amount > hardCap) revert ExceedsHardCap();
        if (_blockContributions[block.number] + amount > maxPerBlock) revert ExceedsBlockLimit();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();
        if (phase.whitelistOnly && !whitelisted[phaseId][msg.sender]) revert NotWhitelisted();

        uint256 tokensToAllocate = (amount * 1e18) / phase.pricePerToken;
        if (phase.sold + tokensToAllocate > phase.allocation) revert ExceedsAllocation();

        // ── Effects ──
        phase.sold += tokensToAllocate;
        totalRaised += amount;
        totalContributed[msg.sender] += amount;
        _blockContributions[block.number] += amount;
        contributions[msg.sender].amount += amount;
        contributions[msg.sender].tokensAllocated += tokensToAllocate;

        // ── Interactions (CEI: all external calls after state updates) ──
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        if (saleMode == SaleMode.Direct) {
            IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
            contributions[msg.sender].claimed = true;
        } else {
            fractionToken.mint(msg.sender, tokensToAllocate);
            vault.recordAllocation(msg.sender, tokensToAllocate);
        }

        // Auto-finalize if hard cap hit
        if (totalRaised >= hardCap) {
            _finalize();
        }

        emit ContributionMade(msg.sender, phaseId, amount, tokensToAllocate);
    }

    // ── OTC Allocation ───────────────────────────────────────────────────────

    /// @notice Issuer allocates tokens to investor who paid off-platform (OTC).
    ///         OTC amounts are excluded from platform fee calculation.
    function issuerAllocate(
        address investor,
        uint256 tokenAmount,
        string calldata paymentReference
    ) external onlyIssuerOrOwner {
        if (status != SaleStatus.Active && status != SaleStatus.Draft) revert SaleNotActive();
        if (!identityRegistry.isVerified(investor)) revert InvestorNotVerified();

        contributions[investor].tokensAllocated += tokenAmount;
        otcAllocations[investor] += tokenAmount;
        totalOtcAllocated += tokenAmount;

        emit OTCAllocation(investor, tokenAmount, paymentReference);
    }

    // ── Finalization ─────────────────────────────────────────────────────────

    function finalizeSale() external onlyIssuerOrOwner nonReentrant {
        if (status != SaleStatus.Active && status != SaleStatus.Paused) revert CannotFinalize();
        _finalize();
    }

    function _finalize() internal {
        if (totalRaised >= softCap) {
            status = SaleStatus.FinalizedSuccess;

            // Calculate platform fee on on-platform USDC only (OTC excluded)
            uint256 fee = 0;
            if (feeManager != address(0) && feeBasisPoints > 0) {
                fee = (totalRaised * feeBasisPoints) / 10000;
                if (feeCapUsdc > 0 && fee > feeCapUsdc) fee = feeCapUsdc;
                platformFeeCollected = fee;
                paymentToken.safeTransfer(feeManager, fee);
            }

            uint256 issuerAmount = paymentToken.balanceOf(address(this));
            paymentToken.safeTransfer(issuer, issuerAmount);

            // Start vesting if applicable
            if (saleMode == SaleMode.Vested) {
                vault.startVesting();
            }

            emit SaleFinalized(true, totalRaised, fee);
        } else {
            status = SaleStatus.FinalizedFailed;
            emit SaleFinalized(false, totalRaised, 0);
        }
        emit SaleStatusChanged(status);
    }

    // ── Claims & Refunds ─────────────────────────────────────────────────────

    function claimTokens() external nonReentrant {
        if (saleMode == SaleMode.Vested) revert UseVaultClaim();
        if (status != SaleStatus.FinalizedSuccess) revert InvalidStatus();
        Contribution storage contrib = contributions[msg.sender];
        if (contrib.tokensAllocated == 0) revert NothingToClaim();
        if (contrib.claimed) revert AlreadyClaimed();

        contrib.claimed = true;
        IERC20(token).safeTransfer(msg.sender, contrib.tokensAllocated);
        emit TokensClaimed(msg.sender, contrib.tokensAllocated);
    }

    function claimRefund() external nonReentrant {
        if (status != SaleStatus.FinalizedFailed) revert InvalidStatus();
        Contribution storage contrib = contributions[msg.sender];
        if (contrib.amount == 0) revert NothingToClaim();
        if (contrib.refunded) revert AlreadyClaimed();
        if (otcAllocations[msg.sender] > 0 && contrib.amount == 0) revert NothingToClaim(); // OTC-only = no on-platform USDC to refund

        contrib.refunded = true;

        // Vested: burn any fraction tokens the investor holds
        if (saleMode == SaleMode.Vested) {
            uint256 fractionBalance = fractionToken.balanceOf(msg.sender);
            if (fractionBalance > 0) {
                fractionToken.burnFrom(msg.sender, fractionBalance);
            }
        }

        uint256 refundAmount = contrib.amount;
        paymentToken.safeTransfer(msg.sender, refundAmount);
        emit RefundClaimed(msg.sender, refundAmount);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getPhaseCount() external view returns (uint256) { return phases.length; }
    function getPhase(uint256 phaseId) external view returns (Phase memory) { return phases[phaseId]; }
    function getContribution(address contributor) external view returns (Contribution memory) { return contributions[contributor]; }
    function getTotalRaised() external view returns (uint256) { return totalRaised; }

    function getCurrentPhase() external view returns (uint256) {
        for (uint256 i = 0; i < phases.length; i++) {
            if (block.timestamp >= phases[i].startTime && block.timestamp <= phases[i].endTime) {
                return i;
            }
        }
        return type(uint256).max;
    }

    function calculateFee(uint256 onPlatformRaised) external view returns (uint256) {
        if (feeBasisPoints == 0) return 0;
        uint256 fee = (onPlatformRaised * feeBasisPoints) / 10000;
        if (feeCapUsdc > 0 && fee > feeCapUsdc) return feeCapUsdc;
        return fee;
    }
}
