// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IIdentity.sol";

/**
 * @title IClaimIssuer
 * @dev Interface for Claim Issuers
 */
interface IClaimIssuer is IIdentity {
    // Events
    event ClaimRevoked(bytes indexed signature);

    // Functions
    function revokeClaim(bytes32 claimId, address identity) external returns (bool);

    function revokeClaimBySignature(bytes calldata signature) external;

    function isClaimRevoked(bytes calldata signature) external view returns (bool);

    function isClaimValid(
        IIdentity identity,
        uint256 claimTopic,
        bytes calldata sig,
        bytes calldata data
    ) external view returns (bool);

    function getRecoveredAddress(
        bytes calldata sig,
        bytes32 dataHash
    ) external pure returns (address);
}
