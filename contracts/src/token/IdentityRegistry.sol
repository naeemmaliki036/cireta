// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IIdentityRegistryStorage.sol";
import "../interfaces/IClaimTopicsRegistry.sol";
import "../interfaces/ITrustedIssuersRegistry.sol";
import "../interfaces/IIdentity.sol";

/**
 * @title IdentityRegistry
 * @dev Registry linking investor wallets to their ONCHAINID identities
 */
contract IdentityRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IIdentityRegistry
{
    // Storage contract
    IIdentityRegistryStorage private _identityStorage;

    // Claim topics registry
    IClaimTopicsRegistry private _claimTopicsRegistry;

    // Trusted issuers registry
    ITrustedIssuersRegistry private _trustedIssuersRegistry;

    // Agents who can register identities
    mapping(address => bool) private _agents;

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
        address claimTopicsRegistry_,
        address trustedIssuersRegistry_,
        address identityStorage_
    ) public initializer {
        __Ownable_init(initialOwner);

        _claimTopicsRegistry = IClaimTopicsRegistry(claimTopicsRegistry_);
        _trustedIssuersRegistry = ITrustedIssuersRegistry(trustedIssuersRegistry_);
        _identityStorage = IIdentityRegistryStorage(identityStorage_);

        emit ClaimTopicsRegistrySet(claimTopicsRegistry_);
        emit TrustedIssuersRegistrySet(trustedIssuersRegistry_);
        emit IdentityStorageBound(identityStorage_);
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

    // ============ Identity Management ============

    function registerIdentity(
        address userAddress,
        IIdentity identity_,
        uint16 country
    ) external override onlyAgent {
        require(userAddress != address(0), "zero user address");
        require(address(identity_) != address(0), "zero identity");

        _identityStorage.addIdentityToStorage(userAddress, identity_, country);

        emit IdentityRegistered(userAddress, identity_);
    }

    function deleteIdentity(address userAddress) external override onlyAgent {
        require(userAddress != address(0), "zero address");
        require(_identityStorage.storedIdentity(userAddress) != IIdentity(address(0)), "not registered");

        IIdentity identity_ = _identityStorage.storedIdentity(userAddress);
        _identityStorage.removeIdentityFromStorage(userAddress);

        emit IdentityRemoved(userAddress, identity_);
    }

    function updateIdentity(
        address userAddress,
        IIdentity identity_
    ) external override onlyAgent {
        require(userAddress != address(0), "zero address");
        require(address(identity_) != address(0), "zero identity");
        require(_identityStorage.storedIdentity(userAddress) != IIdentity(address(0)), "not registered");

        IIdentity oldIdentity = _identityStorage.storedIdentity(userAddress);
        _identityStorage.modifyStoredIdentity(userAddress, identity_);

        emit IdentityUpdated(userAddress, oldIdentity, identity_);
    }

    function updateCountry(
        address userAddress,
        uint16 country
    ) external override onlyAgent {
        require(userAddress != address(0), "zero address");
        require(_identityStorage.storedIdentity(userAddress) != IIdentity(address(0)), "not registered");

        _identityStorage.modifyStoredInvestorCountry(userAddress, country);

        emit CountryUpdated(userAddress, country);
    }

    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata identities,
        uint16[] calldata countries
    ) external override onlyAgent {
        require(
            userAddresses.length == identities.length &&
            userAddresses.length == countries.length,
            "length mismatch"
        );

        for (uint256 i = 0; i < userAddresses.length; i++) {
            _identityStorage.addIdentityToStorage(
                userAddresses[i],
                identities[i],
                countries[i]
            );
            emit IdentityRegistered(userAddresses[i], identities[i]);
        }
    }

    // ============ Verification ============

    function contains(address userAddress) external view override returns (bool) {
        return _identityStorage.storedIdentity(userAddress) != IIdentity(address(0));
    }

    function isVerified(address userAddress) external view override returns (bool) {
        IIdentity identity_ = _identityStorage.storedIdentity(userAddress);
        if (address(identity_) == address(0)) {
            return false;
        }

        uint256[] memory requiredTopics = _claimTopicsRegistry.getClaimTopics();

        // Check each required claim topic
        for (uint256 i = 0; i < requiredTopics.length; i++) {
            if (!_hasValidClaim(identity_, requiredTopics[i])) {
                return false;
            }
        }

        return true;
    }

    function _hasValidClaim(
        IIdentity identity_,
        uint256 claimTopic
    ) internal view returns (bool) {
        bytes32[] memory claimIds = identity_.getClaimIdsByTopic(claimTopic);

        for (uint256 i = 0; i < claimIds.length; i++) {
            (
                ,
                ,
                address issuer,
                bytes memory signature,
                bytes memory data,

            ) = identity_.getClaim(claimIds[i]);

            // Check if issuer is trusted for this topic
            if (_trustedIssuersRegistry.hasClaimTopic(issuer, claimTopic)) {
                // Verify claim signature
                if (
                    IClaimIssuer(issuer).isClaimValid(
                        identity_,
                        claimTopic,
                        signature,
                        data
                    )
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    // ============ View Functions ============

    function identity(address userAddress) external view override returns (IIdentity) {
        return _identityStorage.storedIdentity(userAddress);
    }

    function investorCountry(address userAddress) external view override returns (uint16) {
        return _identityStorage.storedInvestorCountry(userAddress);
    }

    function identityStorage() external view override returns (IIdentityRegistryStorage) {
        return _identityStorage;
    }

    function claimTopicsRegistry() external view override returns (IClaimTopicsRegistry) {
        return _claimTopicsRegistry;
    }

    function trustedIssuersRegistry() external view override returns (ITrustedIssuersRegistry) {
        return _trustedIssuersRegistry;
    }
}
