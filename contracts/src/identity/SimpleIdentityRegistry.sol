// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

/**
 * @title SimpleIdentityRegistry
 * @dev Lightweight whitelist-based identity registry that implements IIdentityRegistry.
 *
 *      Instead of checking ONCHAINID claims, this contract uses a simple
 *      mapping(address => bool) whitelist. The platform admin/agents add or
 *      remove wallets after off-chain KYC is approved.
 *
 *      Drop-in replacement for the full IdentityRegistry. CiretaToken calls
 *      only isVerified() and identity() — both are supported here.
 *
 *      To switch back to full ERC-3643:
 *        1. Deploy IdentityRegistry implementation
 *        2. Update CiretaTokenFactory.identityRegistryImplementation
 *        3. New tokens will use the full ONCHAINID flow
 *        (Existing tokens keep their registry — no migration needed)
 */
contract SimpleIdentityRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IIdentityRegistry
{
    /// @dev wallet => verified status
    mapping(address => bool) private _whitelist;

    /// @dev wallet => country code (ISO 3166-1 numeric)
    mapping(address => uint16) private _countries;

    /// @dev agents who can add/remove from whitelist
    mapping(address => bool) private _agents;

    /// @dev total whitelisted addresses
    uint256 public whitelistedCount;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    modifier onlyAgent() {
        require(_agents[msg.sender] || msg.sender == owner(), "not agent");
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
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Agent Management ============

    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "zero address");
        _agents[agent] = true;
    }

    function removeAgent(address agent) external onlyOwner {
        _agents[agent] = false;
    }

    function isAgent(address agent) external view returns (bool) {
        return _agents[agent];
    }

    // ============ Whitelist Management ============

    /**
     * @dev Add a single wallet to the whitelist.
     */
    function addToWhitelist(address wallet, uint16 country) external onlyAgent {
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
    function removeFromWhitelist(address wallet) external onlyAgent {
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
    ) external onlyAgent {
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
    function batchRemoveFromWhitelist(address[] calldata wallets) external onlyAgent {
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

    /**
     * @dev The only function CiretaToken calls on every transfer.
     *      Simple lookup instead of ONCHAINID claim verification.
     */
    function isVerified(address userAddress) external view override returns (bool) {
        return _whitelist[userAddress];
    }

    function contains(address userAddress) external view override returns (bool) {
        return _whitelist[userAddress];
    }

    /**
     * @dev Returns the wallet address cast as IIdentity (placeholder).
     *      CiretaToken only uses this in recoveryAddress() — for simple mode
     *      recovery should be handled off-chain via admin removing old + adding new wallet.
     */
    function identity(address userAddress) external view override returns (IIdentity) {
        if (_whitelist[userAddress]) {
            return IIdentity(userAddress);
        }
        return IIdentity(address(0));
    }

    function investorCountry(address userAddress) external view override returns (uint16) {
        return _countries[userAddress];
    }

    // ============ IIdentityRegistry — Registration (delegate to whitelist) ============

    function registerIdentity(
        address userAddress,
        IIdentity, /* identity_ — unused */
        uint16 country
    ) external override onlyAgent {
        require(userAddress != address(0), "zero address");
        if (!_whitelist[userAddress]) {
            _whitelist[userAddress] = true;
            _countries[userAddress] = country;
            whitelistedCount++;
            emit IdentityRegistered(userAddress, IIdentity(userAddress));
        }
    }

    function deleteIdentity(address userAddress) external override onlyAgent {
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
        // No-op in simple mode — identity is just the wallet address
    }

    function updateCountry(address userAddress, uint16 country) external override onlyAgent {
        require(_whitelist[userAddress], "not registered");
        _countries[userAddress] = country;
        emit CountryUpdated(userAddress, country);
    }

    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata, /* identities — unused */
        uint16[] calldata countries
    ) external override onlyAgent {
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
