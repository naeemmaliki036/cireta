// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IIdentity.sol";
import "./IClaimTopicsRegistry.sol";
import "./ITrustedIssuersRegistry.sol";
import "./IIdentityRegistryStorage.sol";

/**
 * @title IIdentityRegistry
 * @dev Interface for the Identity Registry used in ERC-3643 tokens
 */
interface IIdentityRegistry {
    // Events
    event IdentityRegistered(
        address indexed investorAddress,
        IIdentity indexed identity
    );

    event IdentityRemoved(
        address indexed investorAddress,
        IIdentity indexed identity
    );

    event IdentityUpdated(
        address indexed investorAddress,
        IIdentity indexed oldIdentity,
        IIdentity indexed newIdentity
    );

    event CountryUpdated(
        address indexed investorAddress,
        uint16 indexed country
    );

    event IdentityStorageBound(address indexed identityStorage);

    event ClaimTopicsRegistrySet(address indexed claimTopicsRegistry);

    event TrustedIssuersRegistrySet(address indexed trustedIssuersRegistry);

    // Functions
    function registerIdentity(
        address userAddress,
        IIdentity identity,
        uint16 country
    ) external;

    function deleteIdentity(address userAddress) external;

    function updateIdentity(address userAddress, IIdentity identity) external;

    function updateCountry(address userAddress, uint16 country) external;

    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata identities,
        uint16[] calldata countries
    ) external;

    function contains(address userAddress) external view returns (bool);

    function isVerified(address userAddress) external view returns (bool);

    function identity(address userAddress) external view returns (IIdentity);

    function investorCountry(address userAddress) external view returns (uint16);

    function identityStorage() external view returns (IIdentityRegistryStorage);

    function claimTopicsRegistry()
        external
        view
        returns (IClaimTopicsRegistry);

    function trustedIssuersRegistry()
        external
        view
        returns (ITrustedIssuersRegistry);
}
