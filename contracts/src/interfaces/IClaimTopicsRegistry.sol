// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IClaimTopicsRegistry
 * @dev Interface for the Claim Topics Registry
 */
interface IClaimTopicsRegistry {
    // Events
    event ClaimTopicAdded(uint256 indexed claimTopic);
    event ClaimTopicRemoved(uint256 indexed claimTopic);

    // Functions
    function addClaimTopic(uint256 claimTopic) external;

    function removeClaimTopic(uint256 claimTopic) external;

    function getClaimTopics() external view returns (uint256[] memory);
}
