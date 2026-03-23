// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";

/// @title Sale
/// @notice Multi-phase token sale with soft/hard cap, platform fee, OTC allocation, and refunds.
contract Sale is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SaleStatus { Draft, Active, Paused, FinalizedSuccess, FinalizedFailed }

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

    // Per-block contribution limit (front-running protection)
    uint256 public maxPerBlock;
    mapping(uint256 => uint256) private _blockContributions;

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
        require(
            status == SaleStatus.Draft || status == SaleStatus.Active,
            "cannot add phase"
        );
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
        require(_maxPerBlock > 0, "zero max per block");
        maxPerBlock = _maxPerBlock;
    }

    // ── Contribute ───────────────────────────────────────────────────────────

    function contribute(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(SaleStatus.Active) {
        require(phaseId < phases.length, "invalid phase");
        Phase storage phase = phases[phaseId];
        require(block.timestamp >= phase.startTime, "phase not started");
        require(block.timestamp <= phase.endTime, "phase ended");
        require(amount >= phase.minContribution, "below min");
        require(totalContributed[msg.sender] + amount <= phase.maxContribution, "exceeds max");
        require(totalRaised + amount <= hardCap, "exceeds hard cap");
        require(_blockContributions[block.number] + amount <= maxPerBlock, "exceeds block limit");
        require(identityRegistry.isVerified(msg.sender), "KYC required");
        if (phase.whitelistOnly) require(whitelisted[phaseId][msg.sender], "not whitelisted");

        uint256 tokensToAllocate = (amount * 1e18) / phase.pricePerToken;
        require(phase.sold + tokensToAllocate <= phase.allocation, "exceeds allocation");

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        phase.sold += tokensToAllocate;
        totalRaised += amount;
        totalContributed[msg.sender] += amount;
        _blockContributions[block.number] += amount;
        contributions[msg.sender].amount += amount;
        contributions[msg.sender].tokensAllocated += tokensToAllocate;

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
        require(
            status == SaleStatus.Active || status == SaleStatus.Draft,
            "sale not active"
        );
        require(identityRegistry.isVerified(investor), "investor not verified");

        contributions[investor].tokensAllocated += tokenAmount;
        contributions[investor].isOtc = true;
        totalOtcAllocated += tokenAmount;

        emit OTCAllocation(investor, tokenAmount, paymentReference);
    }

    // ── Finalization ─────────────────────────────────────────────────────────

    function finalizeSale() external onlyIssuerOrOwner nonReentrant {
        require(
            status == SaleStatus.Active || status == SaleStatus.Paused,
            "cannot finalize"
        );
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

            emit SaleFinalized(true, totalRaised, fee);
        } else {
            status = SaleStatus.FinalizedFailed;
            emit SaleFinalized(false, totalRaised, 0);
        }
        emit SaleStatusChanged(status);
    }

    // ── Claims & Refunds ─────────────────────────────────────────────────────

    function claimTokens() external nonReentrant {
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
        if (contrib.isOtc) revert NothingToClaim(); // OTC = no on-platform USDC to refund

        contrib.refunded = true;
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
