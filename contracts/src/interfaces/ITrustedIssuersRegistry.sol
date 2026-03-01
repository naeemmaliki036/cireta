// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IClaimIssuer.sol";

/**
 * @title ITrustedIssuersRegistry
 * @dev Interface for the Trusted Issuers Registry
 */
interface ITrustedIssuersRegistry {
    // Events
    event TrustedIssuerAdded(
        IClaimIssuer indexed trustedIssuer,
        uint256[] claimTopics
    );

    event TrustedIssuerRemoved(IClaimIssuer indexed trustedIssuer);

    event ClaimTopicsUpdated(
        IClaimIssuer indexed trustedIssuer,
        uint256[] claimTopics
    );

    // Functions
    function addTrustedIssuer(
        IClaimIssuer trustedIssuer,
        uint256[] calldata claimTopics
    ) external;

    function removeTrustedIssuer(IClaimIssuer trustedIssuer) external;

    function updateIssuerClaimTopics(
        IClaimIssuer trustedIssuer,
        uint256[] calldata claimTopics
    ) external;

    function getTrustedIssuers() external view returns (IClaimIssuer[] memory);

    function isTrustedIssuer(address issuer) external view returns (bool);

    function getTrustedIssuerClaimTopics(IClaimIssuer trustedIssuer)
        external
        view
        returns (uint256[] memory);

    function hasClaimTopic(address issuer, uint256 claimTopic)
        external
        view
        returns (bool);
}
