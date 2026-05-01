// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title IssuerRegistry
 * @dev Registry of approved issuers with role-based access control.
 *
 *      Roles:
 *        - DEFAULT_ADMIN_ROLE: Can grant/revoke roles, upgrade contract
 *        - ISSUER_MANAGER_ROLE: Can register, activate, suspend, update issuers
 */
contract IssuerRegistry is
    Initializable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    /// @dev Role that can manage issuers (register, activate, suspend)
    bytes32 public constant ISSUER_MANAGER_ROLE = keccak256("ISSUER_MANAGER_ROLE");

    enum IssuerStatus {
        None,
        Pending,
        Active,
        Suspended
    }

    struct Issuer {
        address wallet;
        string name;
        string jurisdiction;
        IssuerStatus status;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    // Mapping issuer wallet => issuer data
    mapping(address => Issuer) public issuers;

    // Array of all issuer addresses
    address[] private _issuerAddresses;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[100] private __gap;

    // Events
    event IssuerRegistered(address indexed wallet, string name, string jurisdiction);
    event IssuerActivated(address indexed wallet);
    event IssuerSuspended(address indexed wallet, string reason);
    event IssuerUpdated(address indexed wallet, string name, string jurisdiction);
    /// @notice One-time migration to AccessControl. Parity with
    /// SimpleIdentityRegistry — ops tooling uses this to confirm the
    /// registry was upgraded.
    event MigratedToRoles(address indexed admin);
    /// @notice Emitted on every UUPS upgrade. The proxy also emits
    /// ERC1967 `Upgraded(impl)`; this adds the nonce so monitors can
    /// distinguish the upgrade sequence.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

    /// @dev Can manage issuers: ISSUER_MANAGER_ROLE or owner
    modifier onlyIssuerManager() {
        require(
            hasRole(ISSUER_MANAGER_ROLE, msg.sender) || msg.sender == owner(),
            "not issuer manager"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        upgradeNonce++;
        emit ImplementationUpgraded(newImplementation, upgradeNonce);
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "5.0.0"; }

    /// @dev Flag to prevent double-initialization of AccessControl
    bool private _rolesInitialized;

    /**
     * @dev One-time migration from owner-only to AccessControl.
     *      Initializes AccessControl and grants DEFAULT_ADMIN_ROLE to owner.
     *      Call after upgrading the proxy implementation.
     */
    function migrateToRoles() external onlyOwner {
        require(!_rolesInitialized, "already migrated");
        _grantRole(DEFAULT_ADMIN_ROLE, owner());
        _rolesInitialized = true;
        emit MigratedToRoles(owner());
    }

    modifier onlyActiveIssuer() {
        require(issuers[msg.sender].status == IssuerStatus.Active, "not active issuer");
        _;
    }

    function registerIssuer(
        address wallet,
        string calldata name,
        string calldata jurisdiction
    ) external onlyIssuerManager {
        require(wallet != address(0), "zero address");
        require(bytes(name).length > 0, "empty name");
        require(issuers[wallet].status == IssuerStatus.None, "already registered");

        issuers[wallet] = Issuer({
            wallet: wallet,
            name: name,
            jurisdiction: jurisdiction,
            status: IssuerStatus.Pending,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });

        _issuerAddresses.push(wallet);

        emit IssuerRegistered(wallet, name, jurisdiction);
    }

    function activateIssuer(address wallet) external onlyIssuerManager {
        require(issuers[wallet].status == IssuerStatus.Pending, "not pending");

        issuers[wallet].status = IssuerStatus.Active;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerActivated(wallet);
    }

    function suspendIssuer(
        address wallet,
        string calldata reason
    ) external onlyIssuerManager {
        require(
            issuers[wallet].status == IssuerStatus.Active ||
            issuers[wallet].status == IssuerStatus.Pending,
            "invalid status"
        );

        issuers[wallet].status = IssuerStatus.Suspended;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerSuspended(wallet, reason);
    }

    function reactivateIssuer(address wallet) external onlyIssuerManager {
        require(issuers[wallet].status == IssuerStatus.Suspended, "not suspended");

        issuers[wallet].status = IssuerStatus.Active;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerActivated(wallet);
    }

    function updateIssuer(
        address wallet,
        string calldata name,
        string calldata jurisdiction
    ) external onlyIssuerManager {
        require(issuers[wallet].status != IssuerStatus.None, "not registered");
        require(bytes(name).length > 0, "empty name");

        issuers[wallet].name = name;
        issuers[wallet].jurisdiction = jurisdiction;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerUpdated(wallet, name, jurisdiction);
    }

    function isActiveIssuer(address wallet) external view returns (bool) {
        return issuers[wallet].status == IssuerStatus.Active;
    }

    function getIssuer(address wallet) external view returns (Issuer memory) {
        return issuers[wallet];
    }

    function getAllIssuers() external view returns (address[] memory) {
        return _issuerAddresses;
    }

    function getActiveIssuers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _issuerAddresses.length; i++) {
            if (issuers[_issuerAddresses[i]].status == IssuerStatus.Active) {
                count++;
            }
        }

        address[] memory active = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _issuerAddresses.length; i++) {
            if (issuers[_issuerAddresses[i]].status == IssuerStatus.Active) {
                active[index] = _issuerAddresses[i];
                index++;
            }
        }

        return active;
    }
}
