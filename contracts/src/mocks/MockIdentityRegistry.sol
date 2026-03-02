// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IIdentity.sol";

/// @title MockIdentityRegistry
/// @notice For testing — always returns verified, accepts any registration.
contract MockIdentityRegistry is IIdentityRegistry {
    function isVerified(address) external pure override returns (bool) { return true; }
    function contains(address) external pure override returns (bool) { return true; }
    function registerIdentity(address, IIdentity, uint16) external override {}
    function deleteIdentity(address) external override {}
    function updateIdentity(address, IIdentity) external override {}
    function updateCountry(address, uint16) external override {}
    function batchRegisterIdentity(address[] calldata, IIdentity[] calldata, uint16[] calldata) external override {}
    function identity(address) external pure override returns (IIdentity) { return IIdentity(address(0)); }
    function investorCountry(address) external pure override returns (uint16) { return 0; }
    function identityStorage() external pure override returns (IIdentityRegistryStorage) { return IIdentityRegistryStorage(address(0)); }
    function claimTopicsRegistry() external pure override returns (IClaimTopicsRegistry) { return IClaimTopicsRegistry(address(0)); }
    function trustedIssuersRegistry() external pure override returns (ITrustedIssuersRegistry) { return ITrustedIssuersRegistry(address(0)); }
}
