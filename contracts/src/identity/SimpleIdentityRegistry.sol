// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

/**
 * @title SimpleIdentityRegistry
 * @dev Lightweight whitelist-based identity registry with role-based access control.
 *
 *      Uses OpenZeppelin AccessControl for granular permissions:
 *        - REGISTRAR_ROLE: Can add wallets (KYC automation, backend signer)
 *        - COMPLIANCE_ROLE: Can remove wallets (compliance officers)
 *        - AGENT_ROLE: Legacy full access (add + remove, backward compat)
 *        - DEFAULT_ADMIN_ROLE: Can grant/revoke roles, upgrade contract
 *
 *      Drop-in replacement for the full IdentityRegistry. CiretaToken calls
 *      only isVerified() and identity() — both are supported here.
 */
contract SimpleIdentityRegistry is
    Initializable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    IIdentityRegistry
{
    /// @dev Role that can add wallets to the whitelist (KYC agent, backend signer)
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @dev Role that can remove wallets from the whitelist (compliance officer)
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    /// @dev Legacy role with full add + remove access (backward compatibility)
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    /// @dev wallet => verified status
    mapping(address => bool) private _whitelist;

    /// @dev wallet => country code (ISO 3166-1 numeric)
    mapping(address => uint16) private _countries;

    /// @dev Legacy agents mapping (kept for backward compat reads)
    mapping(address => bool) private _agents;

    /// @dev total whitelisted addresses
    uint256 public whitelistedCount;

    /// @dev Reserved storage gap for future upgrades
    uint256[46] private __gap;

    /// @dev Can add wallets: REGISTRAR_ROLE, AGENT_ROLE, or legacy _agents
    modifier onlyRegistrar() {
        require(
            hasRole(REGISTRAR_ROLE, msg.sender) ||
            hasRole(AGENT_ROLE, msg.sender) ||
            _agents[msg.sender] ||
            msg.sender == owner(),
            "not registrar"
        );
        _;
    }

    /// @dev Can remove wallets: COMPLIANCE_ROLE, AGENT_ROLE, or legacy _agents
    modifier onlyCompliance() {
        require(
            hasRole(COMPLIANCE_ROLE, msg.sender) ||
            hasRole(AGENT_ROLE, msg.sender) ||
            _agents[msg.sender] ||
            msg.sender == owner(),
            "not compliance"
        );
        _;
    }

    /// @dev Legacy modifier — checks all roles + old mapping
    modifier onlyAgent() {
        require(
            hasRole(REGISTRAR_ROLE, msg.sender) ||
            hasRole(COMPLIANCE_ROLE, msg.sender) ||
            hasRole(AGENT_ROLE, msg.sender) ||
            _agents[msg.sender] ||
            msg.sender == owner(),
            "not agent"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address, /* claimTopicsRegistry_ — unused in simple mode */
        address, /* trustedIssuersRegistry_ — unused in simple mode */
        address  /* identityStorage_ — unused in simple mode */
    ) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ Role Migration (call after UUPS upgrade) ============

    /// @dev Flag to prevent double-initialization of AccessControl
    bool private _rolesInitialized;

    /**
     * @dev One-time migration from legacy agent system to AccessControl.
     *      Initializes AccessControl and grants DEFAULT_ADMIN_ROLE to the owner.
     *      Call this immediately after upgrading the proxy implementation.
     */
    function migrateToRoles() external onlyOwner {
        require(!_rolesInitialized, "already migrated");
        // NOTE: We skip __AccessControl_init() because the proxy is already initialized.
        // AccessControl doesn't need initialization — just grant the role directly.
        _grantRole(DEFAULT_ADMIN_ROLE, owner());
        _rolesInitialized = true;
    }

    // ============ Agent Management (backward compatible) ============

    /**
     * @dev Legacy addAgent — now also grants AGENT_ROLE.
     */
    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "zero address");
        _agents[agent] = true;
        _grantRole(AGENT_ROLE, agent);
    }

    /**
     * @dev Legacy removeAgent — now also revokes AGENT_ROLE.
     */
    function removeAgent(address agent) external onlyOwner {
        _agents[agent] = false;
        _revokeRole(AGENT_ROLE, agent);
    }

    /**
     * @dev Check if address is an agent (reads both old mapping and new roles).
     */
    function isAgent(address agent) external view returns (bool) {
        return _agents[agent] ||
            hasRole(AGENT_ROLE, agent) ||
            hasRole(REGISTRAR_ROLE, agent) ||
            hasRole(COMPLIANCE_ROLE, agent);
    }

    // ============ Whitelist Management ============

    /**
     * @dev Add a single wallet to the whitelist.
     */
    function addToWhitelist(address wallet, uint16 country) external onlyRegistrar {
        require(wallet != address(0), "zero address");
        if (!_whitelist[wallet]) {
            _whitelist[wallet] = true;
            _countries[wallet] = country;
            whitelistedCount++;
            emit IdentityRegistered(wallet, IIdentity(wallet));
        }
    }

    /**
     * @dev Remove a single wallet from the whitelist.
     */
    function removeFromWhitelist(address wallet) external onlyCompliance {
        require(wallet != address(0), "zero address");
        if (_whitelist[wallet]) {
            _whitelist[wallet] = false;
            _countries[wallet] = 0;
            whitelistedCount--;
            emit IdentityRemoved(wallet, IIdentity(wallet));
        }
    }

    /**
     * @dev Batch-add wallets to the whitelist.
     */
    function batchAddToWhitelist(
        address[] calldata wallets,
        uint16[] calldata countries
    ) external onlyRegistrar {
        require(wallets.length == countries.length, "length mismatch");
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] != address(0) && !_whitelist[wallets[i]]) {
                _whitelist[wallets[i]] = true;
                _countries[wallets[i]] = countries[i];
                whitelistedCount++;
                emit IdentityRegistered(wallets[i], IIdentity(wallets[i]));
            }
        }
    }

    /**
     * @dev Batch-remove wallets from the whitelist.
     */
    function batchRemoveFromWhitelist(address[] calldata wallets) external onlyCompliance {
        for (uint256 i = 0; i < wallets.length; i++) {
            if (_whitelist[wallets[i]]) {
                _whitelist[wallets[i]] = false;
                _countries[wallets[i]] = 0;
                whitelistedCount--;
                emit IdentityRemoved(wallets[i], IIdentity(wallets[i]));
            }
        }
    }

    // ============ IIdentityRegistry Implementation ============

    function isVerified(address userAddress) external view override returns (bool) {
        return _whitelist[userAddress];
    }

    function contains(address userAddress) external view override returns (bool) {
        return _whitelist[userAddress];
    }

    function identity(address userAddress) external view override returns (IIdentity) {
        if (_whitelist[userAddress]) {
            return IIdentity(userAddress);
        }
        return IIdentity(address(0));
    }

    function investorCountry(address userAddress) external view override returns (uint16) {
        return _countries[userAddress];
    }

    // ============ IIdentityRegistry — Registration ============

    function registerIdentity(
        address userAddress,
        IIdentity, /* identity_ — unused */
        uint16 country
    ) external override onlyRegistrar {
        require(userAddress != address(0), "zero address");
        if (!_whitelist[userAddress]) {
            _whitelist[userAddress] = true;
            _countries[userAddress] = country;
            whitelistedCount++;
            emit IdentityRegistered(userAddress, IIdentity(userAddress));
        }
    }

    function deleteIdentity(address userAddress) external override onlyCompliance {
        require(_whitelist[userAddress], "not registered");
        _whitelist[userAddress] = false;
        _countries[userAddress] = 0;
        whitelistedCount--;
        emit IdentityRemoved(userAddress, IIdentity(userAddress));
    }

    function updateIdentity(
        address userAddress,
        IIdentity /* identity_ — unused */
    ) external view override onlyAgent {
        require(_whitelist[userAddress], "not registered");
    }

    function updateCountry(address userAddress, uint16 country) external override onlyRegistrar {
        require(_whitelist[userAddress], "not registered");
        _countries[userAddress] = country;
        emit CountryUpdated(userAddress, country);
    }

    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata, /* identities — unused */
        uint16[] calldata countries
    ) external override onlyRegistrar {
        require(userAddresses.length == countries.length, "length mismatch");
        for (uint256 i = 0; i < userAddresses.length; i++) {
            if (userAddresses[i] != address(0) && !_whitelist[userAddresses[i]]) {
                _whitelist[userAddresses[i]] = true;
                _countries[userAddresses[i]] = countries[i];
                whitelistedCount++;
                emit IdentityRegistered(userAddresses[i], IIdentity(userAddresses[i]));
            }
        }
    }

    // ============ Registry References (return zero — not used in simple mode) ============

    function identityStorage() external pure override returns (IIdentityRegistryStorage) {
        return IIdentityRegistryStorage(address(0));
    }

    function claimTopicsRegistry() external pure override returns (IClaimTopicsRegistry) {
        return IClaimTopicsRegistry(address(0));
    }

    function trustedIssuersRegistry() external pure override returns (ITrustedIssuersRegistry) {
        return ITrustedIssuersRegistry(address(0));
    }
}
