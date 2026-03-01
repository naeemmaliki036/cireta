// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";

/**
 * @title Sale
 * @dev Token sale contract with multiple phases
 */
contract Sale is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    enum SaleStatus {
        Draft,
        Active,
        Paused,
        Finalized,
        Failed
    }

    struct Phase {
        string name;
        uint256 pricePerToken;     // Price in payment token units per token
        uint256 allocation;         // Total tokens available in this phase
        uint256 sold;               // Tokens sold in this phase
        uint256 minContribution;    // Minimum contribution per tx
        uint256 maxContribution;    // Maximum contribution per address
        uint256 startTime;
        uint256 endTime;
        bool whitelistOnly;
    }

    struct Contribution {
        uint256 amount;             // Payment amount
        uint256 tokensAllocated;    // Tokens to receive
        bool claimed;
        bool refunded;
    }

    // Token being sold
    address public token;

    // Payment token (e.g., USDC)
    IERC20 public paymentToken;

    // Identity registry for KYC verification
    IIdentityRegistry public identityRegistry;

    // Issuer wallet
    address public issuer;

    // Platform fee manager
    address public feeManager;

    // Sale caps
    uint256 public softCap;
    uint256 public hardCap;

    // Total raised
    uint256 public totalRaised;

    // Sale status
    SaleStatus public status;

    // Phases
    Phase[] public phases;

    // Whitelists per phase
    mapping(uint256 => mapping(address => bool)) public whitelisted;

    // Contributions per user
    mapping(address => Contribution) public contributions;

    // Total contributed per address (across all phases)
    mapping(address => uint256) public totalContributed;

    // Events
    event PhaseAdded(uint256 indexed phaseId, string name, uint256 pricePerToken);
    event ContributionMade(
        address indexed contributor,
        uint256 indexed phaseId,
        uint256 amount,
        uint256 tokensAllocated
    );
    event TokensClaimed(address indexed claimer, uint256 amount);
    event Refunded(address indexed contributor, uint256 amount);
    event SaleFinalized(uint256 totalRaised);
    event SaleFailed();
    event SaleStatusChanged(SaleStatus newStatus);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _paymentToken,
        address _identityRegistry,
        address _issuer,
        address _feeManager,
        uint256 _softCap,
        uint256 _hardCap
    ) public initializer {
        require(_token != address(0), "zero token");
        require(_paymentToken != address(0), "zero payment token");
        require(_identityRegistry != address(0), "zero identity registry");
        require(_issuer != address(0), "zero issuer");
        require(_softCap <= _hardCap, "soft > hard cap");

        __Ownable_init(_issuer);

        token = _token;
        paymentToken = IERC20(_paymentToken);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        issuer = _issuer;
        feeManager = _feeManager;
        softCap = _softCap;
        hardCap = _hardCap;
        status = SaleStatus.Draft;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    modifier onlyStatus(SaleStatus _status) {
        require(status == _status, "invalid status");
        _;
    }

    // ============ Phase Management ============

    function addPhase(
        string calldata _name,
        uint256 _pricePerToken,
        uint256 _allocation,
        uint256 _minContribution,
        uint256 _maxContribution,
        uint256 _startTime,
        uint256 _endTime,
        bool _whitelistOnly
    ) external onlyOwner onlyStatus(SaleStatus.Draft) {
        require(_pricePerToken > 0, "zero price");
        require(_allocation > 0, "zero allocation");
        require(_startTime < _endTime, "invalid times");
        require(_minContribution <= _maxContribution, "min > max");

        phases.push(Phase({
            name: _name,
            pricePerToken: _pricePerToken,
            allocation: _allocation,
            sold: 0,
            minContribution: _minContribution,
            maxContribution: _maxContribution,
            startTime: _startTime,
            endTime: _endTime,
            whitelistOnly: _whitelistOnly
        }));

        emit PhaseAdded(phases.length - 1, _name, _pricePerToken);
    }

    function addToWhitelist(
        uint256 phaseId,
        address[] calldata addresses
    ) external onlyOwner {
        require(phaseId < phases.length, "invalid phase");
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[phaseId][addresses[i]] = true;
        }
    }

    function removeFromWhitelist(
        uint256 phaseId,
        address[] calldata addresses
    ) external onlyOwner {
        require(phaseId < phases.length, "invalid phase");
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[phaseId][addresses[i]] = false;
        }
    }

    // ============ Sale Control ============

    function activate() external onlyOwner onlyStatus(SaleStatus.Draft) {
        require(phases.length > 0, "no phases");
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

    // ============ Contribution ============

    function contribute(
        uint256 phaseId,
        uint256 amount
    ) external nonReentrant onlyStatus(SaleStatus.Active) {
        require(phaseId < phases.length, "invalid phase");
        Phase storage phase = phases[phaseId];

        require(block.timestamp >= phase.startTime, "phase not started");
        require(block.timestamp <= phase.endTime, "phase ended");
        require(amount >= phase.minContribution, "below min");
        require(
            totalContributed[msg.sender] + amount <= phase.maxContribution,
            "exceeds max"
        );
        require(totalRaised + amount <= hardCap, "exceeds hard cap");

        // Check KYC
        require(identityRegistry.isVerified(msg.sender), "KYC required");

        // Check whitelist
        if (phase.whitelistOnly) {
            require(whitelisted[phaseId][msg.sender], "not whitelisted");
        }

        // Calculate tokens
        uint256 tokensToAllocate = (amount * 1e18) / phase.pricePerToken;
        require(phase.sold + tokensToAllocate <= phase.allocation, "exceeds allocation");

        // Transfer payment
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update state
        phase.sold += tokensToAllocate;
        totalRaised += amount;
        totalContributed[msg.sender] += amount;

        contributions[msg.sender].amount += amount;
        contributions[msg.sender].tokensAllocated += tokensToAllocate;

        emit ContributionMade(msg.sender, phaseId, amount, tokensToAllocate);
    }

    // ============ Finalization ============

    function finalize() external onlyOwner {
        require(
            status == SaleStatus.Active || status == SaleStatus.Paused,
            "invalid status"
        );

        if (totalRaised >= softCap) {
            status = SaleStatus.Finalized;

            // Transfer funds to issuer (minus platform fee if applicable)
            uint256 balance = paymentToken.balanceOf(address(this));
            if (feeManager != address(0)) {
                // Fee collection handled externally
                paymentToken.safeTransfer(issuer, balance);
            } else {
                paymentToken.safeTransfer(issuer, balance);
            }

            emit SaleFinalized(totalRaised);
        } else {
            status = SaleStatus.Failed;
            emit SaleFailed();
        }

        emit SaleStatusChanged(status);
    }

    // ============ Claims & Refunds ============

    function claim() external nonReentrant onlyStatus(SaleStatus.Finalized) {
        Contribution storage contrib = contributions[msg.sender];
        require(contrib.tokensAllocated > 0, "no tokens");
        require(!contrib.claimed, "already claimed");

        contrib.claimed = true;

        // Transfer tokens (assumes tokens are held by this contract)
        IERC20(token).safeTransfer(msg.sender, contrib.tokensAllocated);

        emit TokensClaimed(msg.sender, contrib.tokensAllocated);
    }

    function refund() external nonReentrant onlyStatus(SaleStatus.Failed) {
        Contribution storage contrib = contributions[msg.sender];
        require(contrib.amount > 0, "no contribution");
        require(!contrib.refunded, "already refunded");

        contrib.refunded = true;
        uint256 refundAmount = contrib.amount;

        paymentToken.safeTransfer(msg.sender, refundAmount);

        emit Refunded(msg.sender, refundAmount);
    }

    // ============ View Functions ============

    function getPhaseCount() external view returns (uint256) {
        return phases.length;
    }

    function getPhase(uint256 phaseId) external view returns (Phase memory) {
        require(phaseId < phases.length, "invalid phase");
        return phases[phaseId];
    }

    function getCurrentPhase() external view returns (uint256) {
        for (uint256 i = 0; i < phases.length; i++) {
            if (
                block.timestamp >= phases[i].startTime &&
                block.timestamp <= phases[i].endTime
            ) {
                return i;
            }
        }
        return type(uint256).max; // No active phase
    }

    function getContribution(
        address contributor
    ) external view returns (Contribution memory) {
        return contributions[contributor];
    }
}
