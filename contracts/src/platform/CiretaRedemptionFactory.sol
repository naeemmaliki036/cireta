// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../token/RedemptionManager.sol";

/**
 * @title CiretaRedemptionFactory
 * @dev Platform-level factory for deploying RedemptionManager proxies — one per token.
 *      The caller (typically the token issuer) becomes the owner of the deployed
 *      RedemptionManager, which gives them authority to fulfil and cancel requests.
 *
 *      Deploying a RedemptionManager is OPTIONAL — tokens with manual_off_chain
 *      redemption don't need one. This factory exists to make the on_chain path
 *      one-click for issuers via the admin UI.
 */
contract CiretaRedemptionFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public redemptionManagerImplementation;

    /// @notice One RedemptionManager per token. tokenRedemptionManager[token] == 0 means none deployed yet.
    mapping(address => address) public tokenRedemptionManager;

    /// @notice All RedemptionManager proxies deployed by this factory (for indexer iteration).
    address[] public allRedemptionManagers;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    event RedemptionManagerDeployed(
        address indexed token,
        address indexed redemptionManager,
        address indexed issuer
    );
    event RedemptionManagerImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    /// @notice Emitted on every UUPS upgrade. ERC1967 also emits `Upgraded(impl)`;
    /// this carries the nonce so off-chain monitors can sequence upgrade events.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

    error AlreadyDeployed(address existing);
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address initialOwner,
        address _redemptionManagerImplementation
    ) public initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_redemptionManagerImplementation == address(0)) revert ZeroAddress();
        __Ownable_init(initialOwner);
        redemptionManagerImplementation = _redemptionManagerImplementation;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        upgradeNonce++;
        emit ImplementationUpgraded(newImplementation, upgradeNonce);
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "1.0.0"; }

    // ── Configuration (admin-only) ──────────────────────────────────────────

    function setRedemptionManagerImplementation(address impl) external onlyOwner {
        if (impl == address(0)) revert ZeroAddress();
        address old = redemptionManagerImplementation;
        redemptionManagerImplementation = impl;
        emit RedemptionManagerImplementationUpdated(old, impl);
    }

    // ── Deployment ──────────────────────────────────────────────────────────

    /**
     * @notice Deploy a RedemptionManager proxy bound to `token`. Caller becomes
     *         the RedemptionManager's owner (issuer who fulfils/cancels requests).
     * @param token   ERC-20 token the RedemptionManager will accept burns for.
     * @return rm     Address of the newly deployed RedemptionManager proxy.
     *
     * @dev Reverts if a RedemptionManager has already been deployed for this token
     *      via this factory. If the issuer wants a new one (e.g. to rotate ownership),
     *      the platform admin must do it directly — this factory enforces uniqueness
     *      to keep `tokens.redemption_manager_address` (off-chain) authoritative.
     */
    function deployRedemptionManager(address token) external returns (address rm) {
        if (token == address(0)) revert ZeroAddress();
        address existing = tokenRedemptionManager[token];
        if (existing != address(0)) revert AlreadyDeployed(existing);

        bytes memory initData = abi.encodeWithSelector(
            RedemptionManager.initialize.selector,
            token,
            msg.sender // caller (issuer) owns the RedemptionManager
        );

        ERC1967Proxy proxy = new ERC1967Proxy(redemptionManagerImplementation, initData);
        rm = address(proxy);

        tokenRedemptionManager[token] = rm;
        allRedemptionManagers.push(rm);

        emit RedemptionManagerDeployed(token, rm, msg.sender);
    }

    // ── Views ───────────────────────────────────────────────────────────────

    function getAllRedemptionManagers() external view returns (address[] memory) {
        return allRedemptionManagers;
    }

    function getRedemptionManagerCount() external view returns (uint256) {
        return allRedemptionManagers.length;
    }
}
