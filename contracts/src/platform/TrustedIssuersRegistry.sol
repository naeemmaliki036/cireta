// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/ITrustedIssuersRegistry.sol";

/**
 * @title TrustedIssuersRegistry
 * @dev Registry of trusted claim issuers for identity verification
 */
contract TrustedIssuersRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ITrustedIssuersRegistry
{
    // Array of trusted issuers
    IClaimIssuer[] private _trustedIssuers;

    // Mapping issuer => is trusted
    mapping(address => bool) private _isTrustedIssuer;

    // Mapping issuer => claim topics they can issue
    mapping(address => uint256[]) private _issuerClaimTopics;

    // Mapping issuer => topic => can issue
    mapping(address => mapping(uint256 => bool)) private _hasClaimTopic;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function addTrustedIssuer(
        IClaimIssuer trustedIssuer,
        uint256[] calldata claimTopics
    ) external override onlyOwner {
        require(address(trustedIssuer) != address(0), "zero address");
        require(!_isTrustedIssuer[address(trustedIssuer)], "already trusted");
        require(claimTopics.length > 0, "no claim topics");

        _trustedIssuers.push(trustedIssuer);
        _isTrustedIssuer[address(trustedIssuer)] = true;
        _issuerClaimTopics[address(trustedIssuer)] = claimTopics;

        for (uint256 i = 0; i < claimTopics.length; i++) {
            _hasClaimTopic[address(trustedIssuer)][claimTopics[i]] = true;
        }

        emit TrustedIssuerAdded(trustedIssuer, claimTopics);
    }

    function removeTrustedIssuer(
        IClaimIssuer trustedIssuer
    ) external override onlyOwner {
        require(_isTrustedIssuer[address(trustedIssuer)], "not trusted");

        // Remove claim topic mappings
        uint256[] memory topics = _issuerClaimTopics[address(trustedIssuer)];
        for (uint256 i = 0; i < topics.length; i++) {
            delete _hasClaimTopic[address(trustedIssuer)][topics[i]];
        }
        delete _issuerClaimTopics[address(trustedIssuer)];
        _isTrustedIssuer[address(trustedIssuer)] = false;

        // Remove from array
        uint256 length = _trustedIssuers.length;
        for (uint256 i = 0; i < length; i++) {
            if (_trustedIssuers[i] == trustedIssuer) {
                _trustedIssuers[i] = _trustedIssuers[length - 1];
                _trustedIssuers.pop();
                break;
            }
        }

        emit TrustedIssuerRemoved(trustedIssuer);
    }

    function updateIssuerClaimTopics(
        IClaimIssuer trustedIssuer,
        uint256[] calldata claimTopics
    ) external override onlyOwner {
        require(_isTrustedIssuer[address(trustedIssuer)], "not trusted");
        require(claimTopics.length > 0, "no claim topics");

        // Remove old topic mappings
        uint256[] memory oldTopics = _issuerClaimTopics[address(trustedIssuer)];
        for (uint256 i = 0; i < oldTopics.length; i++) {
            delete _hasClaimTopic[address(trustedIssuer)][oldTopics[i]];
        }

        // Set new topics
        _issuerClaimTopics[address(trustedIssuer)] = claimTopics;
        for (uint256 i = 0; i < claimTopics.length; i++) {
            _hasClaimTopic[address(trustedIssuer)][claimTopics[i]] = true;
        }

        emit ClaimTopicsUpdated(trustedIssuer, claimTopics);
    }

    function getTrustedIssuers()
        external
        view
        override
        returns (IClaimIssuer[] memory)
    {
        return _trustedIssuers;
    }

    function isTrustedIssuer(address issuer) external view override returns (bool) {
        return _isTrustedIssuer[issuer];
    }

    function getTrustedIssuerClaimTopics(
        IClaimIssuer trustedIssuer
    ) external view override returns (uint256[] memory) {
        return _issuerClaimTopics[address(trustedIssuer)];
    }

    function hasClaimTopic(
        address issuer,
        uint256 claimTopic
    ) external view override returns (bool) {
        return _hasClaimTopic[issuer][claimTopic];
    }
}
