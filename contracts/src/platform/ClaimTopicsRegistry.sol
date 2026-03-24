// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IClaimTopicsRegistry.sol";

/**
 * @title ClaimTopicsRegistry
 * @dev Registry of claim topics required for investor verification
 */
contract ClaimTopicsRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IClaimTopicsRegistry
{
    // Standard claim topics
    uint256 public constant CLAIM_TOPIC_KYC = 1;
    uint256 public constant CLAIM_TOPIC_AML = 2;
    uint256 public constant CLAIM_TOPIC_ACCREDITED_INVESTOR = 3;
    uint256 public constant CLAIM_TOPIC_JURISDICTION = 4;

    // Array of required claim topics
    uint256[] private _claimTopics;

    // Mapping topic => exists
    mapping(uint256 => bool) private _claimTopicExists;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function addClaimTopic(uint256 claimTopic) external override onlyOwner {
        require(claimTopic > 0, "invalid topic");
        require(!_claimTopicExists[claimTopic], "topic exists");

        _claimTopics.push(claimTopic);
        _claimTopicExists[claimTopic] = true;

        emit ClaimTopicAdded(claimTopic);
    }

    function removeClaimTopic(uint256 claimTopic) external override onlyOwner {
        require(_claimTopicExists[claimTopic], "topic not found");

        _claimTopicExists[claimTopic] = false;

        // Remove from array
        uint256 length = _claimTopics.length;
        for (uint256 i = 0; i < length; i++) {
            if (_claimTopics[i] == claimTopic) {
                _claimTopics[i] = _claimTopics[length - 1];
                _claimTopics.pop();
                break;
            }
        }

        emit ClaimTopicRemoved(claimTopic);
    }

    function getClaimTopics() external view override returns (uint256[] memory) {
        return _claimTopics;
    }
}
