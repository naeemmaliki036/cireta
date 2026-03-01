// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistryStorage.sol";

/**
 * @title IdentityRegistryStorage
 * @dev Storage contract for identity data, shared across multiple Identity Registries
 */
contract IdentityRegistryStorage is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IIdentityRegistryStorage
{
    // Mapping of investor address to identity contract
    mapping(address => IIdentity) private _identities;

    // Mapping of investor address to country code
    mapping(address => uint16) private _countries;

    // Array of linked identity registries
    address[] private _identityRegistries;

    // Mapping to check if an identity registry is linked
    mapping(address => bool) private _identityRegistryLinked;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    modifier onlyLinkedRegistry() {
        require(
            _identityRegistryLinked[msg.sender],
            "caller not linked registry"
        );
        _;
    }

    function addIdentityToStorage(
        address userAddress,
        IIdentity identity,
        uint16 country
    ) external override onlyLinkedRegistry {
        require(userAddress != address(0), "zero address");
        require(address(identity) != address(0), "zero identity");
        require(address(_identities[userAddress]) == address(0), "already stored");

        _identities[userAddress] = identity;
        _countries[userAddress] = country;

        emit IdentityStored(userAddress, identity);
    }

    function removeIdentityFromStorage(
        address userAddress
    ) external override onlyLinkedRegistry {
        require(address(_identities[userAddress]) != address(0), "not stored");

        IIdentity identity = _identities[userAddress];
        delete _identities[userAddress];
        delete _countries[userAddress];

        emit IdentityUnstored(userAddress, identity);
    }

    function modifyStoredIdentity(
        address userAddress,
        IIdentity identity
    ) external override onlyLinkedRegistry {
        require(address(_identities[userAddress]) != address(0), "not stored");
        require(address(identity) != address(0), "zero identity");

        IIdentity oldIdentity = _identities[userAddress];
        _identities[userAddress] = identity;

        emit IdentityModified(userAddress, oldIdentity, identity);
    }

    function modifyStoredInvestorCountry(
        address userAddress,
        uint16 country
    ) external override onlyLinkedRegistry {
        require(address(_identities[userAddress]) != address(0), "not stored");

        _countries[userAddress] = country;

        emit CountryModified(userAddress, country);
    }

    function bindIdentityRegistry(
        address identityRegistry
    ) external override onlyOwner {
        require(identityRegistry != address(0), "zero address");
        require(!_identityRegistryLinked[identityRegistry], "already bound");

        _identityRegistries.push(identityRegistry);
        _identityRegistryLinked[identityRegistry] = true;

        emit IdentityRegistryBound(identityRegistry);
    }

    function unbindIdentityRegistry(
        address identityRegistry
    ) external override onlyOwner {
        require(_identityRegistryLinked[identityRegistry], "not bound");

        _identityRegistryLinked[identityRegistry] = false;

        // Remove from array
        uint256 length = _identityRegistries.length;
        for (uint256 i = 0; i < length; i++) {
            if (_identityRegistries[i] == identityRegistry) {
                _identityRegistries[i] = _identityRegistries[length - 1];
                _identityRegistries.pop();
                break;
            }
        }

        emit IdentityRegistryUnbound(identityRegistry);
    }

    function linkedIdentityRegistries()
        external
        view
        override
        returns (address[] memory)
    {
        return _identityRegistries;
    }

    function storedIdentity(
        address userAddress
    ) external view override returns (IIdentity) {
        return _identities[userAddress];
    }

    function storedInvestorCountry(
        address userAddress
    ) external view override returns (uint16) {
        return _countries[userAddress];
    }
}
