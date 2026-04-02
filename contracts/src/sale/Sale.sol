// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../fraction/CiretaFractionToken.sol";
import "../vault/CiretaVault.sol";
import "../otc/IssuerOTCToken.sol";

/// @title Sale
/// @notice Multi-phase token sale with soft/hard cap, platform fee, OTC allocation, and refunds.
///         Admin is resolved dynamically from factory.owner() — single source of truth.
///         - admin: whoever owns the CiretaSaleFactory at call time (platform admin / multisig)
///         - factory: the CiretaSaleFactory that deployed this sale (also treated as admin for deploy-time setup)
///         - issuer: token issuer — day-to-day sale operations, fund withdrawal
contract Sale is Initializable, UUPSUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SaleStatus { Draft, Active, Paused, FinalizedSuccess, FinalizedFailed }
    enum SaleMode { Direct, Vested }
    enum SaleStructure { PhaseAllocated, PriceTiered }

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
    address public factory;     // CiretaSaleFactory — admin resolved via factory.owner()
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
    uint256 public maxPerBlock;
    mapping(uint256 => uint256) private _blockContributions;

    // ── Vested mode state ─────────────────────────────────────────────────────
    SaleMode public saleMode;
    CiretaVault public vault;
    CiretaFractionToken public fractionToken;

    // ── OTC token state ──────────────────────────────────────────────────────
    IssuerOTCToken public otcToken;

    // ── Sale structure ──────────────────────────────────────────────────────
    SaleStructure public saleStructure;

    // ── Emergency withdrawal ────────────────────────────────────────────────
    uint256 public finalizedAt;
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 90 days;

    /// @dev Reserved storage gap for future upgrades
    uint256[46] private __gap;

    // ── Events ───────────────────────────────────────────────────────────────
    event PhaseAdded(uint256 indexed phaseId, string name, uint256 pricePerToken);
    event Purchase(address indexed buyer, uint256 indexed phaseId, uint256 amount, uint256 tokensAllocated, bool isOTC);
    event OTCAllocation(address indexed investor, uint256 tokensAllocated, string paymentReference);
    event TokensClaimed(address indexed claimer, uint256 amount);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event SaleFinalized(bool success, uint256 totalRaised, uint256 platformFee);
    event SaleStatusChanged(SaleStatus newStatus);
    event MaxPerBlockUpdated(uint256 newMax);
    event WhitelistUpdated(uint256 indexed phaseId, uint256 count, bool allow);
    event EmergencyWithdraw(address indexed recipient, uint256 amount);
    event ProjectTokensDeposited(uint256 amount);
    event FundsWithdrawn(address indexed recipient, uint256 amount);

    // ── Errors ───────────────────────────────────────────────────────────────
    error InvalidStatus();
    error NotAdmin();
    error NotIssuer();
    error NotIssuerOrAdmin();
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
    error OTCNotEnabled();
    error NothingToWithdraw();
    error SaleNotFinalized();
    error TokensNotDeposited();
    error DelayNotElapsed();

    // ── Access Control ──────────────────────────────────────────────────────

    /// @dev Returns the current platform admin (factory's owner). Single source of truth.
    function admin() public view returns (address) {
        return OwnableUpgradeable(factory).owner();
    }

    /// @dev Is the caller the platform admin or the factory itself?
    function _isAdmin() internal view returns (bool) {
        return msg.sender == factory || msg.sender == OwnableUpgradeable(factory).owner();
    }

    modifier adminOnly() {
        if (!_isAdmin()) revert NotAdmin();
        _;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    modifier onlyIssuerOrAdmin() {
        if (msg.sender != issuer && !_isAdmin()) revert NotIssuerOrAdmin();
        _;
    }

    modifier onlyStatus(SaleStatus s) {
        if (status != s) revert InvalidStatus();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _token,
        address _paymentToken,
        address _identityRegistry,
        address _issuer,
        address _factory,
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
        if (_factory == address(0)) revert ZeroAddress();
        if (_feeManager == address(0)) revert ZeroAddress();

        token = _token;
        paymentToken = IERC20(_paymentToken);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        issuer = _issuer;
        factory = _factory;
        feeManager = _feeManager;
        softCap = _softCap;
        hardCap = _hardCap;
        feeBasisPoints = _feeBasisPoints;
        feeCapUsdc = _feeCapUsdc;
        maxPerBlock = 50_000 * 1e6; // 50,000 USDC default per-block cap
        status = SaleStatus.Draft;
    }

    function _authorizeUpgrade(address) internal override adminOnly {}

    // ── Admin-Only Functions ────────────────────────────────────────────────

    /// @notice Activate the sale (Draft → Active). Admin approval gate.
    function activate() external adminOnly onlyStatus(SaleStatus.Draft) {
        status = SaleStatus.Active;
        emit SaleStatusChanged(SaleStatus.Active);
    }

    /// @notice Unpause the sale. Only admin can lift a regulatory hold.
    function unpause() external adminOnly onlyStatus(SaleStatus.Paused) {
        status = SaleStatus.Active;
        emit SaleStatusChanged(SaleStatus.Active);
    }

    /// @notice Configure vested mode. Must be called before activation.
    function setVestedMode(address _vault, address _fractionToken) external adminOnly onlyStatus(SaleStatus.Draft) {
        if (_vault == address(0) || _fractionToken == address(0)) revert ZeroAddress();
        saleMode = SaleMode.Vested;
        vault = CiretaVault(_vault);
        fractionToken = CiretaFractionToken(_fractionToken);
    }

    // ── Issuer-Only Functions ───────────────────────────────────────────────

    /// @notice Add a sale phase. Only issuer configures their own sale.
    function addPhase(
        string calldata name,
        uint256 pricePerToken,
        uint256 allocation,
        uint256 minContribution,
        uint256 maxContribution,
        uint256 startTime,
        uint256 endTime,
        bool whitelistOnly
    ) external onlyIssuer {
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

    /// @notice Manage investor whitelist per phase. Only issuer.
    function setWhitelist(uint256 phaseId, address[] calldata addresses, bool allow) external onlyIssuer {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[phaseId][addresses[i]] = allow;
        }
        emit WhitelistUpdated(phaseId, addresses.length, allow);
    }

    /// @notice Set per-block contribution limit. Only issuer.
    function setMaxPerBlock(uint256 _maxPerBlock) external onlyIssuer {
        if (_maxPerBlock == 0) revert ZeroMaxPerBlock();
        maxPerBlock = _maxPerBlock;
        emit MaxPerBlockUpdated(_maxPerBlock);
    }

    /// @notice Set or update the OTC token address. Only issuer.
    function setOTCToken(address _otcToken) external onlyIssuer {
        otcToken = IssuerOTCToken(_otcToken);
    }

    /// @notice Set the sale structure. Only issuer, only in Draft status.
    function setSaleStructure(SaleStructure _structure) external onlyIssuer onlyStatus(SaleStatus.Draft) {
        saleStructure = _structure;
    }

    /// @notice Issuer allocates tokens to investor who paid off-platform (OTC).
    function issuerAllocate(
        address investor,
        uint256 tokenAmount,
        string calldata paymentReference
    ) external onlyIssuer {
        if (status != SaleStatus.Active && status != SaleStatus.Draft) revert SaleNotActive();
        if (!identityRegistry.isVerified(investor)) revert InvestorNotVerified();

        contributions[investor].tokensAllocated += tokenAmount;
        otcAllocations[investor] += tokenAmount;
        totalOtcAllocated += tokenAmount;

        emit OTCAllocation(investor, tokenAmount, paymentReference);
    }

    /// @notice Deposit project tokens into the vault for vested mode. Only issuer.
    function depositProjectTokens(uint256 amount) external onlyIssuer nonReentrant {
        if (saleMode != SaleMode.Vested) revert InvalidStatus();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(vault), amount);
        vault.depositTokens(amount);
        emit ProjectTokensDeposited(amount);
    }

    /// @notice Withdraw raised USDC to issuer wallet. Only issuer — admin cannot touch.
    function withdrawFunds() external onlyIssuer nonReentrant {
        if (status != SaleStatus.FinalizedSuccess) revert SaleNotFinalized();

        uint256 balance = paymentToken.balanceOf(address(this));
        if (balance == 0) revert NothingToWithdraw();

        paymentToken.safeTransfer(issuer, balance);
        emit FundsWithdrawn(issuer, balance);
    }

    // ── Dual Authority (Issuer or Admin) ────────────────────────────────────

    /// @notice Pause the sale. Both issuer and admin can emergency-pause.
    function pause() external onlyIssuerOrAdmin onlyStatus(SaleStatus.Active) {
        status = SaleStatus.Paused;
        emit SaleStatusChanged(SaleStatus.Paused);
    }

    /// @notice Finalize the sale. Issuer finalizes normally; admin override for abandoned sales.
    function finalizeSale() external onlyIssuerOrAdmin nonReentrant {
        if (status != SaleStatus.Active && status != SaleStatus.Paused) revert CannotFinalize();
        _finalize();
    }

    // ── Emergency Withdrawal ────────────────────────────────────────────────

    /// @notice Emergency withdrawal for admin when issuer disappears.
    ///         Only callable 30 days after successful finalization.
    function emergencyWithdraw(address recipient) external adminOnly nonReentrant {
        if (status != SaleStatus.FinalizedSuccess) revert SaleNotFinalized();
        if (block.timestamp < finalizedAt + EMERGENCY_WITHDRAW_DELAY) revert DelayNotElapsed();
        if (recipient == address(0)) revert ZeroAddress();

        uint256 remaining = paymentToken.balanceOf(address(this));
        if (remaining == 0) revert NothingToWithdraw();

        paymentToken.safeTransfer(recipient, remaining);
        emit EmergencyWithdraw(recipient, remaining);
    }

    // ── Buy ─────────────────────────────────────────────────────────────────

    function buy(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(SaleStatus.Active) {
        // ── Checks ──
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage phase = phases[phaseId];
        if (block.timestamp < phase.startTime) revert PhaseNotStarted();
        if (block.timestamp > phase.endTime) revert PhaseEnded();
        if (totalContributed[msg.sender] == 0 && amount < phase.minContribution) revert BelowMinContribution();
        if (phase.maxContribution > 0 && totalContributed[msg.sender] + amount > phase.maxContribution) revert ExceedsMaxContribution();
        if (totalRaised + amount > hardCap) revert ExceedsHardCap();
        if (_blockContributions[block.number] + amount > maxPerBlock) revert ExceedsBlockLimit();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();
        if (phase.whitelistOnly && !whitelisted[phaseId][msg.sender]) revert NotWhitelisted();

        uint256 tokensToAllocate = (amount * 1e18) / phase.pricePerToken;
        if (saleStructure == SaleStructure.PhaseAllocated) {
            if (phase.sold + tokensToAllocate > phase.allocation) revert ExceedsAllocation();
        }

        // ── Effects ──
        phase.sold += tokensToAllocate;
        totalRaised += amount;
        totalContributed[msg.sender] += amount;
        _blockContributions[block.number] += amount;
        contributions[msg.sender].amount += amount;
        contributions[msg.sender].tokensAllocated += tokensToAllocate;

        // ── Interactions (CEI) ──
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        if (saleMode == SaleMode.Direct) {
            IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
            contributions[msg.sender].claimed = true;
        } else {
            fractionToken.mint(msg.sender, tokensToAllocate);
            vault.recordAllocation(msg.sender, tokensToAllocate);
        }

        if (totalRaised >= hardCap) {
            _finalize();
        }

        emit Purchase(msg.sender, phaseId, amount, tokensToAllocate, false);
    }

    // ── OTC Token Purchase ──────────────────────────────────────────────────

    function buyOTC(uint256 phaseId, uint256 amount) external nonReentrant onlyStatus(SaleStatus.Active) {
        if (address(otcToken) == address(0)) revert OTCNotEnabled();

        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage phase = phases[phaseId];
        if (block.timestamp < phase.startTime) revert PhaseNotStarted();
        if (block.timestamp > phase.endTime) revert PhaseEnded();
        if (totalContributed[msg.sender] == 0 && amount < phase.minContribution) revert BelowMinContribution();
        if (phase.maxContribution > 0 && totalContributed[msg.sender] + amount > phase.maxContribution) revert ExceedsMaxContribution();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();
        if (phase.whitelistOnly && !whitelisted[phaseId][msg.sender]) revert NotWhitelisted();

        uint256 tokensToAllocate = (amount * 1e18) / phase.pricePerToken;
        if (saleStructure == SaleStructure.PhaseAllocated) {
            if (phase.sold + tokensToAllocate > phase.allocation) revert ExceedsAllocation();
        }

        phase.sold += tokensToAllocate;
        totalOtcAllocated += tokensToAllocate;
        totalContributed[msg.sender] += amount;
        contributions[msg.sender].tokensAllocated += tokensToAllocate;
        contributions[msg.sender].isOtc = true;
        otcAllocations[msg.sender] += tokensToAllocate;

        IERC20(address(otcToken)).safeTransferFrom(msg.sender, address(this), amount);
        otcToken.burn(address(this), amount);

        if (saleMode == SaleMode.Direct) {
            IERC20(token).safeTransfer(msg.sender, tokensToAllocate);
            contributions[msg.sender].claimed = true;
        } else {
            fractionToken.mint(msg.sender, tokensToAllocate);
            vault.recordAllocation(msg.sender, tokensToAllocate);
        }

        emit Purchase(msg.sender, phaseId, amount, tokensToAllocate, true);
    }

    // ── Finalization (internal) ─────────────────────────────────────────────

    function _finalize() internal {
        if (totalRaised >= softCap) {
            status = SaleStatus.FinalizedSuccess;
            finalizedAt = block.timestamp;

            uint256 fee = 0;
            if (feeManager != address(0) && feeBasisPoints > 0) {
                fee = (totalRaised * feeBasisPoints) / 10000;
                if (feeCapUsdc > 0 && fee > feeCapUsdc) fee = feeCapUsdc;
                platformFeeCollected = fee;
                paymentToken.safeTransfer(feeManager, fee);
            }

            if (saleMode == SaleMode.Vested) {
                vault.startVesting();
            }

            emit SaleFinalized(true, totalRaised, fee);
        } else {
            status = SaleStatus.FinalizedFailed;
            finalizedAt = block.timestamp;
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

        contrib.refunded = true;

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
