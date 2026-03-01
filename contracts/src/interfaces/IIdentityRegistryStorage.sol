// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IIdentity.sol";

/**
 * @title IIdentityRegistryStorage
 * @dev Interface for the Identity Registry Storage
 */
interface IIdentityRegistryStorage {
    // Events
    event IdentityStored(address indexed investorAddress, IIdentity indexed identity);
    event IdentityUnstored(address indexed investorAddress, IIdentity indexed identity);
    event IdentityModified(
        address indexed investorAddress,
        IIdentity indexed oldIdentity,
        IIdentity indexed newIdentity
    );
    event CountryModified(address indexed investorAddress, uint16 indexed country);
    event IdentityRegistryBound(address indexed identityRegistry);
    event IdentityRegistryUnbound(address indexed identityRegistry);

    // Functions
    function addIdentityToStorage(
        address userAddress,
        IIdentity identity,
        uint16 country
    ) external;

    function removeIdentityFromStorage(address userAddress) external;

    function modifyStoredIdentity(address userAddress, IIdentity identity) external;

    function modifyStoredInvestorCountry(address userAddress, uint16 country) external;

    function bindIdentityRegistry(address identityRegistry) external;

    function unbindIdentityRegistry(address identityRegistry) external;

    function linkedIdentityRegistries() external view returns (address[] memory);

    function storedIdentity(address userAddress) external view returns (IIdentity);

    function storedInvestorCountry(address userAddress) external view returns (uint16);
}
