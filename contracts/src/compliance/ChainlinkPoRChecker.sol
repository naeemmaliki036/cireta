// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IComplianceModule.sol";

/**
 * @title AggregatorV3Interface
 * @dev Chainlink Price Feed interface (subset)
 */
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title ChainlinkPoRChecker
 * @dev Compliance module that checks Chainlink Proof of Reserve feeds.
 *      Blocks transfers if the PoR feed shows zero/negative reserves
 *      or if the data is stale (older than 24 hours).
 */
contract ChainlinkPoRChecker is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    // Compliance contracts bound to this module
    mapping(address => bool) private _complianceBound;

    // Compliance => Chainlink PoR feed address
    mapping(address => AggregatorV3Interface) private _porFeeds;

    // Maximum age of feed data before considered stale (24 hours)
    uint256 public constant MAX_STALENESS = 24 hours;

    // Events
    event FeedSet(address indexed compliance, address indexed feed);
    event FeedRemoved(address indexed compliance);

    // Errors
    error ZeroFeedAddress();
    error StaleData(uint256 updatedAt, uint256 currentTime);
    error InvalidReserve(int256 answer);
    error NoFeedConfigured();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function name() external pure override returns (string memory) {
        return "ChainlinkPoRChecker";
    }

    // ============ Compliance Binding ============

    function bindCompliance(address compliance) external override onlyOwner {
        require(compliance != address(0), "zero address");
        _complianceBound[compliance] = true;
        emit ComplianceBound(compliance);
    }

    function unbindCompliance(address compliance) external override onlyOwner {
        require(_complianceBound[compliance], "not bound");
        _complianceBound[compliance] = false;
        emit ComplianceUnbound(compliance);
    }

    function isComplianceBound(address compliance) external view override returns (bool) {
        return _complianceBound[compliance];
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    // ============ Feed Management ============

    /**
     * @notice Set the Chainlink PoR feed for a compliance contract.
     * @param compliance The compliance contract address.
     * @param feed The Chainlink AggregatorV3Interface feed address.
     */
    function setFeed(address compliance, address feed) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        if (feed == address(0)) revert ZeroFeedAddress();
        _porFeeds[compliance] = AggregatorV3Interface(feed);
        emit FeedSet(compliance, feed);
    }

    /**
     * @notice Remove the PoR feed for a compliance contract.
     * @param compliance The compliance contract address.
     */
    function removeFeed(address compliance) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        delete _porFeeds[compliance];
        emit FeedRemoved(compliance);
    }

    /**
     * @notice Get the feed address for a compliance contract.
     * @param compliance The compliance contract address.
     * @return The feed address (or address(0) if not set).
     */
    function getFeed(address compliance) external view returns (address) {
        return address(_porFeeds[compliance]);
    }

    // ============ Module Actions ============

    function moduleTransferAction(
        address,
        address,
        uint256
    ) external override {
        require(_complianceBound[msg.sender], "not bound");
    }

    function moduleMintAction(address, uint256) external override {
        require(_complianceBound[msg.sender], "not bound");
    }

    function moduleBurnAction(address, uint256) external override {
        require(_complianceBound[msg.sender], "not bound");
    }

    // ============ Transfer Check ============

    /**
     * @notice Check if a transfer is allowed based on PoR feed data.
     * @dev Reverts if feed data is stale (>24h) or shows zero/negative reserves.
     *      Returns true if no feed is configured (fail-open for unconfigured tokens).
     */
    function moduleCheck(
        address,
        address,
        uint256,
        address compliance
    ) external view override returns (bool) {
        AggregatorV3Interface feed = _porFeeds[compliance];

        // If no feed is configured, allow the transfer (fail-open)
        if (address(feed) == address(0)) {
            return true;
        }

        // Get latest round data from Chainlink feed
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = feed.latestRoundData();

        // Check for stale data (older than 24 hours)
        if (block.timestamp - updatedAt > MAX_STALENESS) {
            revert StaleData(updatedAt, block.timestamp);
        }

        // Check for zero or negative reserves
        if (answer <= 0) {
            revert InvalidReserve(answer);
        }

        return true;
    }
}
