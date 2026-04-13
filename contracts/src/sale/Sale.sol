// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../fraction/CiretaFractionToken1155.sol";
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

    enum SaleStatus { Draft, Active, Paused, FinalizedSuccess, FinalizedFailed, Rejected }
    enum SaleMode { Direct, Vested }

    /// @notice Per-phase allocation strategy. Replaces the old global SaleStructure.
    /// - Fixed: phase has a hard cap in token units (`allocation`); reverts when exceeded.
    /// - Remaining: phase can buy any unsold tokens up to the global `totalTokenSupply`.
    enum AllocationMode { Fixed, Remaining }

    struct Phase {
        string name;
        uint256 pricePerToken;     // Payment-token raw units for 1 whole token
        uint256 allocation;        // Fixed mode only — hard cap in raw token units
        uint256 sold;
        uint256 minTokens;         // First-time buyer minimum (whole tokens)
        uint256 maxTokens;         // Per-investor cumulative cap (whole tokens, 0 = unlimited)
        uint256 topUpMinTokens;    // Repeat-buyer minimum per buy (whole tokens)
        uint256 startTime;
        uint256 endTime;
        bool whitelistOnly;
        AllocationMode allocationMode;
    }

    struct Contribution {
        uint256 amount;           // Total contribution (USDC + OTC) — informational
        uint256 tokensAllocated;  // Total tokens received from all sources
        bool claimed;             // Direct mode only
        bool refunded;
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

    // Sale-level window. All phases must fall inside [saleStartTime, saleEndTime].
    // Set in initialize() and immutable thereafter.
    // saleEndTime == 0 means open-ended (see `openEnded` flag below).
    uint256 public saleStartTime;
    uint256 public saleEndTime;

    // Round-5: explicit total token supply declared at sale creation, in token-decimal units.
    // Independent of hardCap (which is denominated in USDC).
    uint256 public totalTokenSupply;
    uint256 public totalTokenSold;            // Σ phase.sold across all phases

    // Token decimals snapshot — read once at init via IERC20Metadata, used in price math.
    uint8 public tokenDecimals;

    // Maximum platform fee in basis points (10% ceiling).
    uint256 public constant MAX_FEE_BPS = 1000;

    // Round-5: open-ended sale safety constants.
    uint256 public constant MAX_SALE_DURATION = 730 days;
    uint256 public constant INACTIVITY_TIMEOUT = 180 days;

    uint256 public totalRaised;              // Total raised across payment-token + OTC (mixed units, kept for hardcap math)
    uint256 public paymentContributedTotal;  // Sum of payment-token (USDC/USDT/etc.) buys only — used for fee calc
    uint256 public platformFeeCollected;

    SaleStatus public status;
    Phase[] public phases;

    mapping(uint256 => mapping(address => bool)) public whitelisted;
    mapping(address => Contribution) public contributions;
    mapping(address => uint256) public totalContributed;
    // Round-5: split payment-token and OTC contribution accounting per buyer.
    // - paymentContributed is the source of truth for refund eligibility (R1 fix).
    //   It tracks contributions paid in the sale's `paymentToken` (USDC, USDT, or
    //   any other ERC-20 the issuer chose). Generic name — sale supports any stable.
    // - otcContributed is informational; OTC refunds are off-chain.
    mapping(address => uint256) public paymentContributed;
    mapping(address => uint256) public otcContributed;

    // Round-5: state for two-step activation, open-ended sales, and refund gate.
    bool public approved;                    // Set by admin's approveSale()
    bool public openEnded;                   // Cached: saleEndTime == 0
    bool public finalizationPending;         // Set when hardcap or supply hit; cleared by finalizeSale()
    bool public refundsActive;               // Set by activateRefunds() after FinalizedFailed
    uint256 public lastPhaseAddedAt;         // For inactivity timeout in open-ended sales

    /// @notice Per-block contribution limit to mitigate front-running attacks.
    // Deprecated: was maxPerBlock + _blockContributions (per-block anti-flash-loan cap).
    // Removed — per-investor maxTokens cap, phase whitelist, pause(), and KYC gating
    // provide stronger protection without the UX cost. Slots reserved to keep storage
    // layout consistent for any future upgrade of pre-existing sales.
    uint256 private __deprecated_maxPerBlock;
    mapping(uint256 => uint256) private __deprecated_blockContributions;

    // ── Vested mode state ─────────────────────────────────────────────────────
    SaleMode public saleMode;
    CiretaVault public vault;
    CiretaFractionToken1155 public fractionToken;
    // Round-5: ERC-1155 token IDs for the two contribution sources.
    uint256 public constant FRACTION_ID_USDC = 1;
    uint256 public constant FRACTION_ID_OTC = 2;

    // ── OTC token state ──────────────────────────────────────────────────────
    IssuerOTCToken public otcToken;

    // ── Emergency withdrawal ────────────────────────────────────────────────
    uint256 public finalizedAt;
    uint256 public constant EMERGENCY_WITHDRAW_DELAY = 90 days;

    /// @notice Incremented on every UUPS upgrade — lets indexer/admin detect upgrades.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades.
    uint256[100] private __gap;

    // ── Events ───────────────────────────────────────────────────────────────
    event PhaseAdded(uint256 indexed phaseId, string name, uint256 pricePerToken);
    event PhaseExtended(uint256 indexed phaseId, uint256 newEndTime);
    event PhaseShortened(uint256 indexed phaseId, uint256 newEndTime);
    event PhaseAdvanced(uint256 indexed phaseId, uint256 newStartTime);
    event Purchase(address indexed buyer, uint256 indexed phaseId, uint256 amount, uint256 tokensAllocated, bool isOTC);
    event TokensClaimed(address indexed claimer, uint256 amount);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event SaleFinalized(bool success, uint256 totalRaised, uint256 platformFee);
    event SaleStatusChanged(SaleStatus newStatus);
    event WhitelistUpdated(uint256 indexed phaseId, uint256 count, bool allow);
    event EmergencyWithdraw(address indexed recipient, uint256 amount);
    event ProjectTokensDeposited(uint256 amount);
    event FundsWithdrawn(address indexed recipient, uint256 amount);
    event TokensWithdrawn(address indexed recipient, uint256 amount);
    // Round-5
    event SaleApproved();
    event SaleUnapproved();
    event FinalizationPending(uint256 totalRaised, uint256 totalTokenSold);
    event RefundsActivated();
    event SaleClosed(bool failed, address closer);

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
    error KYCRequired();
    error NotWhitelisted();
    error ExceedsAllocation();
    error CannotAddPhase();
    error ZeroMinContribution();
    error InvalidCaps();
    error InvalidFeeBps();
    error InvalidSaleWindow();
    error ZeroPricePerToken();
    error InvalidPhaseTimeRange();
    error PhaseOutsideSaleWindow();
    error PhaseInPast();
    error InvalidContributionRange();
    error ZeroPhaseAllocation();
    error PhaseAllocationExceedsHardCap();
    error IssuerNotVerified();
    error VaultEmpty();
    error SaleNotActive();
    error InvestorNotVerified();
    error CannotFinalize();
    error OTCNotEnabled();
    error NothingToWithdraw();
    error SaleNotFinalized();
    error TokensNotDeposited();
    error DelayNotElapsed();
    // Round-5
    error ZeroTokenSupply();
    error SaleWindowTooLong();
    error TokenSupplyExceeded();
    error PhaseOverlap();
    error CannotExtendEnded();
    error ExtensionTooEarly();
    error ExtensionOverlap();
    error TopUpBelowMin();
    error PhaseStillActive();
    error PhaseAlreadyStarted();
    error PhaseNotInFuture();
    error ShortenMustReduce();
    error AdvanceMustReduce();
    error NotApproved();
    error AlreadyApproved();
    error RefundsNotActive();
    error NotPaymentContributor();
    error AmountTooSmall();
    error InsufficientOTCBalance();
    error OTCNotApproved();

    // ── Access Control ──────────────────────────────────────────────────────

    /// @dev Returns the current platform admin (factory's owner). Single source of truth.
    function admin() public view returns (address) {
        return OwnableUpgradeable(factory).owner();
    }

    /// @dev Is the caller the platform admin or the factory itself?
    function _isAdmin() internal view returns (bool) {
        return msg.sender == factory || msg.sender == OwnableUpgradeable(factory).owner();
    }

    /// @dev Same as _isAdmin but parameterized — used by closeSale to check arbitrary callers.
    function _isAdminAddr(address who) internal view returns (bool) {
        return who == factory || who == OwnableUpgradeable(factory).owner();
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

    /// @notice Sale initializer (round 5).
    /// @param _saleEndTime Pass 0 for an open-ended sale (issuer keeps adding phases until they decide to close).
    /// @param _totalTokenSupply Hard cap on total tokens that can ever be sold across all phases (token-decimal units).
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
        uint256 _feeCapUsdc,
        address _otcToken,
        uint256 _saleStartTime,
        uint256 _saleEndTime,
        uint256 _totalTokenSupply
    ) external initializer {
        if (_token == address(0)) revert ZeroAddress();
        if (_paymentToken == address(0)) revert ZeroAddress();
        if (_identityRegistry == address(0)) revert ZeroAddress();
        if (_issuer == address(0)) revert ZeroAddress();
        if (_factory == address(0)) revert ZeroAddress();
        if (_feeManager == address(0)) revert ZeroAddress();
        // Caps must be sane
        if (_softCap == 0 || _hardCap == 0 || _softCap > _hardCap) revert InvalidCaps();
        if (_feeBasisPoints > MAX_FEE_BPS) revert InvalidFeeBps();
        // Round-5: explicit token supply required
        if (_totalTokenSupply == 0) revert ZeroTokenSupply();
        // Sale window: open-ended if _saleEndTime == 0, otherwise validated
        if (_saleEndTime == 0) {
            // Open-ended: still need a valid start in the future
            if (_saleStartTime == 0) revert InvalidSaleWindow();
            openEnded = true;
        } else {
            if (_saleStartTime >= _saleEndTime) revert InvalidSaleWindow();
            if (_saleEndTime <= block.timestamp) revert InvalidSaleWindow();
            // Even fixed-end sales can't span more than the safety floor
            if (_saleEndTime - _saleStartTime > MAX_SALE_DURATION) revert SaleWindowTooLong();
        }
        // Issuer wallet must be KYC-verified
        if (!IIdentityRegistry(_identityRegistry).isVerified(_issuer)) revert IssuerNotVerified();

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
        saleStartTime = _saleStartTime;
        saleEndTime = _saleEndTime;
        totalTokenSupply = _totalTokenSupply;
        lastPhaseAddedAt = _saleStartTime;

        // Snapshot token decimals for the price math (default 18 if read fails)
        try IERC20Metadata(_token).decimals() returns (uint8 d) {
            tokenDecimals = d;
        } catch {
            tokenDecimals = 18;
        }

        if (_otcToken != address(0)) otcToken = IssuerOTCToken(_otcToken);
        status = SaleStatus.Draft;
    }

    function _authorizeUpgrade(address) internal override adminOnly {
        upgradeNonce++;
    }

    /// @notice Contract version — used to verify which impl is live on-chain.
    function version() external pure returns (string memory) { return "5.0.0"; }

    // ── Admin-Only Functions ────────────────────────────────────────────────

    /// @notice Round-5: admin approves the sale (compliance gate).
    /// Approved sales become visible to investors as "pending launch" but
    /// can't accept buys until the issuer calls activate().
    function approveSale() external adminOnly onlyStatus(SaleStatus.Draft) {
        if (approved) revert AlreadyApproved();
        approved = true;
        emit SaleApproved();
    }

    /// @notice Round-5: admin can revoke approval BEFORE the issuer activates.
    function unapproveSale() external adminOnly onlyStatus(SaleStatus.Draft) {
        if (!approved) revert NotApproved();
        approved = false;
        emit SaleUnapproved();
    }

    /// @notice Round-5: ISSUER activates an admin-approved sale.
    /// Authority moved from admin → issuer; admin's role is the upstream
    /// approveSale() compliance gate.
    function activate() external onlyIssuer onlyStatus(SaleStatus.Draft) {
        if (!approved) revert NotApproved();

        // Require project tokens deposited before activation
        if (saleMode == SaleMode.Direct) {
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance == 0) revert TokensNotDeposited();
        } else {
            uint256 vaultBalance = IERC20(token).balanceOf(address(vault));
            if (vaultBalance == 0) revert TokensNotDeposited();
        }
        if (phases.length == 0) revert InvalidStatus();

        status = SaleStatus.Active;
        emit SaleStatusChanged(SaleStatus.Active);
    }

    /// @notice Reject the sale permanently (Draft → Rejected). Admin blocks activation forever.
    /// Issuer can still withdraw deposited project tokens via withdrawTokens().
    function reject() external adminOnly onlyStatus(SaleStatus.Draft) {
        status = SaleStatus.Rejected;
        emit SaleStatusChanged(SaleStatus.Rejected);
    }

    /// @notice Withdraw project tokens from a draft or rejected sale. Issuer reclaims tokens.
    function withdrawTokens() external onlyIssuer nonReentrant {
        if (status != SaleStatus.Draft && status != SaleStatus.Rejected) revert InvalidStatus();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NothingToWithdraw();
        IERC20(token).safeTransfer(issuer, balance);
        emit TokensWithdrawn(issuer, balance);
    }

    /// @notice Withdraw unsold project tokens after sale finalization.
    /// Direct mode: unsold tokens sit in the Sale contract — this sends them to issuer.
    /// Vested mode: calls vault.withdrawExcess() which sends unsold to issuer.
    /// Only callable after FinalizedSuccess.
    function withdrawUnsoldTokens() external onlyIssuer nonReentrant {
        if (status != SaleStatus.FinalizedSuccess) revert SaleNotFinalized();
        if (saleMode == SaleMode.Vested) {
            vault.withdrawExcess();
        } else {
            // Direct mode: unsold = tokens still in this contract
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance == 0) revert NothingToWithdraw();
            IERC20(token).safeTransfer(issuer, balance);
            emit TokensWithdrawn(issuer, balance);
        }
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
        fractionToken = CiretaFractionToken1155(_fractionToken);
    }

    // ── Issuer-Only Functions ───────────────────────────────────────────────

    /// @notice Add a sale phase. Only issuer configures their own sale.
    /// Whole-token buy: min/max/topUp are in whole token units (not USDC).
    /// @param minTokens First-time buyer minimum (whole tokens, e.g. 100)
    /// @param maxTokens Per-investor cumulative cap (whole tokens, 0 = unlimited)
    /// @param topUpMinTokens Repeat-buyer minimum per buy (whole tokens, e.g. 10)
    function addPhase(
        string calldata name,
        uint256 pricePerToken,
        uint256 allocation,
        uint256 minTokens,
        uint256 maxTokens,
        uint256 topUpMinTokens,
        uint256 startTime,
        uint256 endTime,
        bool whitelistOnly,
        AllocationMode allocationMode
    ) external onlyIssuer {
        if (status != SaleStatus.Draft && status != SaleStatus.Active) revert CannotAddPhase();
        if (pricePerToken == 0) revert ZeroPricePerToken();
        if (minTokens == 0) revert ZeroMinContribution();
        if (maxTokens != 0 && maxTokens < minTokens) revert InvalidContributionRange();
        if (topUpMinTokens == 0) revert ZeroMinContribution();
        if (startTime >= endTime) revert InvalidPhaseTimeRange();
        if (endTime <= block.timestamp) revert PhaseInPast();
        if (startTime < saleStartTime) revert PhaseOutsideSaleWindow();

        // Open-ended skips upper bound but enforces the safety floor
        if (openEnded) {
            if (endTime > saleStartTime + MAX_SALE_DURATION) revert SaleWindowTooLong();
        } else {
            if (endTime > saleEndTime) revert PhaseOutsideSaleWindow();
        }

        // Phase overlap detection — linear scan over existing phases
        for (uint256 i = 0; i < phases.length; i++) {
            Phase storage existing = phases[i];
            if (startTime < existing.endTime && existing.startTime < endTime) {
                revert PhaseOverlap();
            }
        }

        // Per-phase allocation mode
        if (allocationMode == AllocationMode.Fixed) {
            if (allocation == 0) revert ZeroPhaseAllocation();
            uint256 fixedSum = _totalFixedAllocations() + allocation;
            if (fixedSum > totalTokenSupply) revert TokenSupplyExceeded();
        }

        phases.push(Phase({
            name: name,
            pricePerToken: pricePerToken,
            allocation: allocation,
            sold: 0,
            minTokens: minTokens,
            maxTokens: maxTokens,
            topUpMinTokens: topUpMinTokens,
            startTime: startTime,
            endTime: endTime,
            whitelistOnly: whitelistOnly,
            allocationMode: allocationMode
        }));
        lastPhaseAddedAt = block.timestamp;
        emit PhaseAdded(phases.length - 1, name, pricePerToken);
    }

    /// @notice Round-5: extend the end time of an active or upcoming phase.
    /// Issuer-only. Cannot shrink, must stay future, must not overlap next phase,
    /// must stay inside sale window.
    function extendPhase(uint256 phaseId, uint256 newEndTime) external onlyIssuer {
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage p = phases[phaseId];

        // Phase must not have ended yet
        if (block.timestamp > p.endTime) revert CannotExtendEnded();
        // Must be strictly later than current end
        if (newEndTime <= p.endTime) revert ExtensionTooEarly();
        // Must be in the future
        if (newEndTime <= block.timestamp) revert PhaseInPast();

        // Must not overlap any subsequent phase (chronological scan)
        for (uint256 i = 0; i < phases.length; i++) {
            if (i == phaseId) continue;
            Phase storage other = phases[i];
            if (other.startTime >= p.endTime && other.startTime < newEndTime) {
                revert ExtensionOverlap();
            }
        }

        // Stay inside sale window
        if (openEnded) {
            if (newEndTime > saleStartTime + MAX_SALE_DURATION) revert SaleWindowTooLong();
        } else {
            if (newEndTime > saleEndTime) revert PhaseOutsideSaleWindow();
        }

        p.endTime = newEndTime;
        emit PhaseExtended(phaseId, newEndTime);
    }

    /// @notice Shorten a phase's end time. Used to close a sold-out phase early
    /// so the next phase can start immediately via addPhase().
    /// newEndTime must be < current endTime and >= block.timestamp (can be "now").
    function shortenPhase(uint256 phaseId, uint256 newEndTime) external onlyIssuer {
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage p = phases[phaseId];
        if (newEndTime >= p.endTime) revert ShortenMustReduce();
        if (newEndTime < block.timestamp) revert PhaseInPast();
        if (newEndTime < p.startTime) revert InvalidPhaseTimeRange();
        p.endTime = newEndTime;
        emit PhaseShortened(phaseId, newEndTime);
    }

    /// @notice Advance a phase's start time earlier. Used when the previous phase
    /// ended early and you want to bring the next phase forward.
    /// Phase must not have started yet. newStartTime must be < current startTime
    /// and >= block.timestamp.
    function advancePhaseStart(uint256 phaseId, uint256 newStartTime) external onlyIssuer {
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage p = phases[phaseId];
        if (block.timestamp >= p.startTime) revert PhaseAlreadyStarted();
        if (newStartTime >= p.startTime) revert AdvanceMustReduce();
        if (newStartTime < block.timestamp) revert PhaseInPast();
        if (newStartTime < saleStartTime) revert PhaseOutsideSaleWindow();
        if (newStartTime >= p.endTime) revert InvalidPhaseTimeRange();

        // Must not overlap any other phase
        for (uint256 i = 0; i < phases.length; i++) {
            if (i == phaseId) continue;
            Phase storage other = phases[i];
            if (newStartTime < other.endTime && other.startTime < p.endTime) {
                revert PhaseOverlap();
            }
        }

        p.startTime = newStartTime;
        emit PhaseAdvanced(phaseId, newStartTime);
    }

    /// @notice Remaining tokens available for sale across all phases.
    function getRemainingSupply() external view returns (uint256) {
        return totalTokenSupply - totalTokenSold;
    }

    /// @dev Sum of all Fixed-mode phase allocations.
    function _totalFixedAllocations() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < phases.length; i++) {
            if (phases[i].allocationMode == AllocationMode.Fixed) {
                sum += phases[i].allocation;
            }
        }
    }

    /// @notice Manage investor whitelist per phase. Only issuer.
    /// Round-5: locked once the phase has started (fairness guarantee).
    function setWhitelist(uint256 phaseId, address[] calldata addresses, bool allow) external onlyIssuer {
        if (status == SaleStatus.Rejected) revert InvalidStatus();
        if (phaseId >= phases.length) revert InvalidPhase();
        if (block.timestamp >= phases[phaseId].startTime) revert PhaseStillActive();
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[phaseId][addresses[i]] = allow;
        }
        emit WhitelistUpdated(phaseId, addresses.length, allow);
    }

    /// @notice Set or update the OTC token address. Only issuer.
    function setOTCToken(address _otcToken) external onlyIssuer {
        if (status == SaleStatus.Rejected) revert InvalidStatus();
        otcToken = IssuerOTCToken(_otcToken);
    }

    // Round-5: setSaleStructure REMOVED — replaced by per-phase AllocationMode.
    // Round-5: issuerAllocate REMOVED — OTC allocations now go through the
    //          OTC token contract + buyOTC() flow. Manual off-platform OTC
    //          refunds are tracked off-chain.

    /// @notice Deposit project tokens into the vault for vested mode. Only issuer.
    function depositProjectTokens(uint256 amount) external onlyIssuer nonReentrant {
        if (status == SaleStatus.Rejected) revert InvalidStatus();
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

    /// @notice Finalize the sale. Issuer or admin can call when:
    /// - finalizationPending is set (hardcap or supply hit), OR
    /// - sale window has expired (fixed-end sales only)
    /// Open-ended sales must use closeSale() instead.
    function finalizeSale() external onlyIssuerOrAdmin nonReentrant {
        if (status != SaleStatus.Active && status != SaleStatus.Paused) revert CannotFinalize();
        bool windowExpired = !openEnded && block.timestamp >= saleEndTime;
        if (!finalizationPending && !windowExpired) revert CannotFinalize();
        _finalize(totalRaised >= softCap);
    }

    /// @notice Round-5: close an open-ended sale.
    /// Authorization tiers:
    /// 1. Issuer or admin (normal close)
    /// 2. Anyone (after MAX_SALE_DURATION elapses from saleStartTime)
    /// 3. Anyone (after INACTIVITY_TIMEOUT since lastPhaseAddedAt + below soft cap)
    /// Preconditions: sale is Active/Paused, has at least 1 phase, no phase currently active.
    /// @param failed If true, force the failed branch even if soft cap met.
    function closeSale(bool failed) external nonReentrant {
        if (status != SaleStatus.Active && status != SaleStatus.Paused) revert InvalidStatus();
        if (phases.length == 0) revert InvalidStatus();

        // No phase may be currently in its [start, end] window
        for (uint256 i = 0; i < phases.length; i++) {
            Phase storage p = phases[i];
            if (block.timestamp >= p.startTime && block.timestamp <= p.endTime) {
                revert PhaseStillActive();
            }
        }

        bool isOwner = msg.sender == issuer || _isAdmin();
        bool safetyFloor = openEnded && block.timestamp >= saleStartTime + MAX_SALE_DURATION;
        bool inactivityTimeout = openEnded
            && block.timestamp >= lastPhaseAddedAt + INACTIVITY_TIMEOUT
            && totalRaised < softCap;

        if (!isOwner && !safetyFloor && !inactivityTimeout) revert NotIssuerOrAdmin();

        // Failed branch is forced for inactivity (issuer ghosted) and explicit failure.
        bool success;
        if (inactivityTimeout) {
            success = false;
        } else if (failed) {
            success = false;
        } else {
            success = totalRaised >= softCap;
        }

        _finalize(success);
        emit SaleClosed(!success, msg.sender);
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

    /// @dev Shared min/topup check in whole-token units.
    /// First-time buyers must meet minTokens; repeat buyers must meet topUpMinTokens.
    /// Last-chunk exception: if remaining supply < min, buyer can purchase exactly
    /// the remaining amount regardless of min. Also supports hard-cap-constrained
    /// last chunk where max affordable tokens < remaining but < min.
    /// @return isLastChunk True if this buy qualifies for last-chunk exception
    ///         (used by _checkBuyEligibility to relax hard cap).
    function _checkMinTokens(Phase storage phase, uint256 tokenQty) internal view returns (bool isLastChunk) {
        uint256 remainingWholeTokens = (totalTokenSupply - totalTokenSold) / (10 ** tokenDecimals);
        uint256 investorWholeTokens = contributions[msg.sender].tokensAllocated / (10 ** tokenDecimals);

        // Determine effective minimum for this buyer
        uint256 effectiveMin = investorWholeTokens == 0 ? phase.minTokens : phase.topUpMinTokens;

        if (tokenQty >= effectiveMin) {
            return false; // Normal buy, no exception needed
        }

        // Below minimum — check last-chunk exceptions
        // Case 1: buying exactly all remaining tokens
        if (tokenQty == remainingWholeTokens) {
            return true;
        }

        // Case 2: hard-cap-constrained — max affordable < remaining < min
        // Allow buying the max tokens that fit within the hard cap
        if (remainingWholeTokens < effectiveMin && phase.pricePerToken > 0) {
            uint256 remainingUsdc = hardCap > totalRaised ? hardCap - totalRaised : 0;
            uint256 maxAffordable = remainingUsdc / phase.pricePerToken;
            if (maxAffordable > 0 && maxAffordable < remainingWholeTokens && tokenQty == maxAffordable) {
                return false; // Not a last-chunk overshoot — fits within hard cap
            }
        }

        // Not a valid last-chunk exception
        if (investorWholeTokens == 0) {
            revert BelowMinContribution();
        } else {
            revert TopUpBelowMin();
        }
    }

    /// @dev Shared phase + buyer eligibility checks.
    /// @param isLastChunk If true, relaxes hard cap check (last-chunk exception).
    function _checkBuyEligibility(uint256 phaseId, uint256 tokenQty, uint256 usdcRequired, bool isLastChunk) internal view returns (Phase storage) {
        if (phaseId >= phases.length) revert InvalidPhase();
        Phase storage phase = phases[phaseId];
        if (block.timestamp < phase.startTime) revert PhaseNotStarted();
        if (block.timestamp > phase.endTime) revert PhaseEnded();
        // Max tokens per investor (cumulative across all phases)
        if (phase.maxTokens > 0) {
            uint256 investorWholeTokens = contributions[msg.sender].tokensAllocated / (10 ** tokenDecimals);
            if (investorWholeTokens + tokenQty > phase.maxTokens) revert ExceedsMaxContribution();
        }
        // Hard cap check — relaxed for last-chunk buys (remaining tokens that
        // would otherwise be permanently stuck). Overshoot is bounded by
        // remainingTokens × pricePerToken which is a small fraction of the cap.
        if (!isLastChunk && totalRaised + usdcRequired > hardCap) revert ExceedsHardCap();
        if (!identityRegistry.isVerified(msg.sender)) revert KYCRequired();
        if (phase.whitelistOnly && !whitelisted[phaseId][msg.sender]) revert NotWhitelisted();
        return phase;
    }

    /// @dev Shared phase allocation check (Fixed mode with rollover) + global supply check.
    /// Fixed phases inherit unsold tokens from prior ended Fixed phases.
    function _checkAllocationAndSupply(Phase storage phase, uint256 tokensToAllocate) internal view {
        if (phase.allocationMode == AllocationMode.Fixed) {
            uint256 effectiveAllocation = phase.allocation + _unsoldFromPriorPhases();
            if (phase.sold + tokensToAllocate > effectiveAllocation) revert ExceedsAllocation();
        }
        if (totalTokenSold + tokensToAllocate > totalTokenSupply) revert TokenSupplyExceeded();
    }

    /// @dev Sum of unsold tokens from all Fixed-mode phases that have ended.
    function _unsoldFromPriorPhases() internal view returns (uint256 unsold) {
        for (uint256 i = 0; i < phases.length; i++) {
            Phase storage p = phases[i];
            if (p.allocationMode == AllocationMode.Fixed && block.timestamp > p.endTime) {
                if (p.allocation > p.sold) {
                    unsold += p.allocation - p.sold;
                }
            }
        }
    }

    /// @notice Buy whole tokens. Investor specifies token quantity (1, 2, 100 — never fractional).
    /// USDC cost is calculated exactly: usdcRequired = tokenQty * pricePerToken. Zero rounding.
    /// @param phaseId Index of the active phase.
    /// @param tokenQty Number of whole tokens to buy.
    function buy(uint256 phaseId, uint256 tokenQty) external nonReentrant onlyStatus(SaleStatus.Active) {
        if (tokenQty == 0) revert AmountTooSmall();

        // Calculate exact cost and raw token amount
        uint256 usdcRequired = tokenQty * phases[phaseId].pricePerToken;
        uint256 tokensRaw = tokenQty * (10 ** tokenDecimals);

        // ── Checks ──
        // _checkMinTokens first to determine if last-chunk exception applies
        bool isLastChunk;
        {
            Phase storage phaseRef = phases[phaseId];
            isLastChunk = _checkMinTokens(phaseRef, tokenQty);
        }
        Phase storage phase = _checkBuyEligibility(phaseId, tokenQty, usdcRequired, isLastChunk);
        _checkAllocationAndSupply(phase, tokensRaw);

        // ── Effects ──
        phase.sold += tokensRaw;
        totalRaised += usdcRequired;
        totalTokenSold += tokensRaw;
        totalContributed[msg.sender] += usdcRequired;
        paymentContributed[msg.sender] += usdcRequired;
        paymentContributedTotal += usdcRequired;
        contributions[msg.sender].amount += usdcRequired;
        contributions[msg.sender].tokensAllocated += tokensRaw;

        // ── Interactions (CEI) ──
        paymentToken.safeTransferFrom(msg.sender, address(this), usdcRequired);

        if (saleMode == SaleMode.Direct) {
            IERC20(token).safeTransfer(msg.sender, tokensRaw);
            contributions[msg.sender].claimed = true;
        } else {
            fractionToken.mint(msg.sender, FRACTION_ID_USDC, tokensRaw, "");
            vault.recordAllocation(msg.sender, FRACTION_ID_USDC, tokensRaw);
        }

        if (totalRaised >= hardCap || totalTokenSold >= totalTokenSupply) {
            if (!finalizationPending) {
                finalizationPending = true;
                emit FinalizationPending(totalRaised, totalTokenSold);
            }
        }

        emit Purchase(msg.sender, phaseId, usdcRequired, tokensRaw, false);
    }

    // ── OTC Token Purchase ──────────────────────────────────────────────────

    /// @notice Buy whole tokens with OTC voucher. Same whole-token semantics as buy().
    /// @param tokenQty Number of whole tokens to buy.
    function buyOTC(uint256 phaseId, uint256 tokenQty) external nonReentrant onlyStatus(SaleStatus.Active) {
        if (address(otcToken) == address(0)) revert OTCNotEnabled();
        if (tokenQty == 0) revert AmountTooSmall();

        uint256 otcRequired = tokenQty * phases[phaseId].pricePerToken;
        uint256 tokensRaw = tokenQty * (10 ** tokenDecimals);

        Phase storage phase = _checkBuyEligibility(phaseId, tokenQty, otcRequired, false);

        if (IERC20(address(otcToken)).balanceOf(msg.sender) < otcRequired) revert InsufficientOTCBalance();
        if (IERC20(address(otcToken)).allowance(msg.sender, address(this)) < otcRequired) revert OTCNotApproved();

        // NOTE: OTC buys intentionally bypass _checkMinTokens (minTokens/topUpMinTokens).
        // Rationale: OTC vouchers are minted by the issuer via MINTER_ROLE to specific
        // pre-vetted investors. The per-phase minimums exist as a public-sale protection;
        // they don't apply to pre-negotiated off-platform allocations. All other
        // protections remain: KYC, whitelist, hard cap, block limit, per-investor
        // maxTokens cap, supply cap, and whole-token enforcement via the math.
        _checkAllocationAndSupply(phase, tokensRaw);

        // ── Effects ──
        phase.sold += tokensRaw;
        totalRaised += otcRequired;
        totalTokenSold += tokensRaw;
        totalContributed[msg.sender] += otcRequired;
        otcContributed[msg.sender] += otcRequired;
        contributions[msg.sender].amount += otcRequired;
        contributions[msg.sender].tokensAllocated += tokensRaw;

        // ── Interactions (CEI) ──
        IERC20(address(otcToken)).safeTransferFrom(msg.sender, address(this), otcRequired);
        otcToken.burn(address(this), otcRequired);

        if (saleMode == SaleMode.Direct) {
            IERC20(token).safeTransfer(msg.sender, tokensRaw);
            contributions[msg.sender].claimed = true;
        } else {
            fractionToken.mint(msg.sender, FRACTION_ID_OTC, tokensRaw, "");
            vault.recordAllocation(msg.sender, FRACTION_ID_OTC, tokensRaw);
        }

        if (totalRaised >= hardCap || totalTokenSold >= totalTokenSupply) {
            if (!finalizationPending) {
                finalizationPending = true;
                emit FinalizationPending(totalRaised, totalTokenSold);
            }
        }

        emit Purchase(msg.sender, phaseId, otcRequired, tokensRaw, true);
    }

    // ── Finalization (internal) ─────────────────────────────────────────────

    /// @dev Round-5: parameterized so closeSale can force the failed branch
    /// even when soft cap is met.
    function _finalize(bool success) internal {
        finalizationPending = false;
        if (success) {
            status = SaleStatus.FinalizedSuccess;
            finalizedAt = block.timestamp;

            // Fee calc uses the payment-token-strict total (not totalRaised which mixes OTC).
            uint256 fee = 0;
            if (feeManager != address(0) && feeBasisPoints > 0) {
                fee = (paymentContributedTotal * feeBasisPoints) / 10000;
                if (feeCapUsdc > 0 && fee > feeCapUsdc) fee = feeCapUsdc;
                platformFeeCollected = fee;
                paymentToken.safeTransfer(feeManager, fee);
            }

            if (saleMode == SaleMode.Vested) {
                if (IERC20(token).balanceOf(address(vault)) == 0) revert VaultEmpty();
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

    /// @notice Round-5: admin/issuer activates the refund window after a failed sale.
    /// One-way switch — once activated, refunds are open forever.
    function activateRefunds() external onlyIssuerOrAdmin {
        if (status != SaleStatus.FinalizedFailed) revert InvalidStatus();
        if (refundsActive) revert AlreadyApproved();
        refundsActive = true;
        emit RefundsActivated();
    }

    /// @notice Round-5 refund — only payment-token contributors are eligible.
    /// (Payment token is whatever stable the issuer chose: USDC, USDT, etc.)
    /// OTC contributors get a clear revert and must use the off-chain refund flow.
    function claimRefund() external nonReentrant {
        if (status != SaleStatus.FinalizedFailed) revert InvalidStatus();
        if (!refundsActive) revert RefundsNotActive();
        Contribution storage contrib = contributions[msg.sender];
        if (contrib.refunded) revert AlreadyClaimed();

        uint256 refundAmount = paymentContributed[msg.sender];
        if (refundAmount == 0) revert NotPaymentContributor();

        contrib.refunded = true;
        paymentContributed[msg.sender] = 0;

        // Burn the investor's id-1 fractions (vested mode only).
        // OTC fractions (id 2) are NOT burned — they stay with the investor as
        // a record of their off-platform allocation. The off-chain OTC refund
        // process handles those separately.
        if (saleMode == SaleMode.Vested) {
            uint256 usdcFractions = fractionToken.balanceOf(msg.sender, FRACTION_ID_USDC);
            if (usdcFractions > 0) {
                fractionToken.burn(msg.sender, FRACTION_ID_USDC, usdcFractions);
            }
        }

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
