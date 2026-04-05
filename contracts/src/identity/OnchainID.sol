// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IIdentity.sol";

/// @title OnchainID
/// @notice Minimal ONCHAINID implementation (ERC-734/735) for investor identity.
///         Stores claims (KYC, AML, etc.) that are verified by the IdentityRegistry.
///         Owner = investor wallet. Claims added by claim issuers.
contract OnchainID is IIdentity, Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // claimId => Claim
    mapping(bytes32 => Claim) private _claims;
    // topic => claimId[]
    mapping(uint256 => bytes32[]) private _claimsByTopic;

    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _owner) external initializer {
        __Ownable_init(_owner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── ERC-735 Claims ──────────────────────────────────────────────────────

    /// @notice Add or update a claim. Callable by:
    ///         - The claim issuer (for their own claims)
    ///         - The identity owner
    function addClaim(
        uint256 topic,
        uint256 scheme,
        address issuer,
        bytes calldata signature,
        bytes calldata data,
        string calldata uri
    ) external override returns (bytes32 claimId) {
        // Only issuer or owner can add claims
        require(msg.sender == issuer || msg.sender == owner(), "Not authorized");

        claimId = keccak256(abi.encode(issuer, topic));

        if (_claims[claimId].issuer != address(0)) {
            // Update existing claim
            _claims[claimId] = Claim(topic, scheme, issuer, signature, data, uri);
            emit ClaimChanged(claimId, topic, scheme, issuer, signature, data, uri);
        } else {
            // New claim
            _claims[claimId] = Claim(topic, scheme, issuer, signature, data, uri);
            _claimsByTopic[topic].push(claimId);
            emit ClaimAdded(claimId, topic, scheme, issuer, signature, data, uri);
        }
    }

    /// @notice Remove a claim. Only owner or the original issuer.
    function removeClaim(bytes32 claimId) external override returns (bool) {
        Claim storage claim = _claims[claimId];
        require(claim.issuer != address(0), "Claim does not exist");
        require(msg.sender == claim.issuer || msg.sender == owner(), "Not authorized");

        uint256 topic = claim.topic;

        // Remove from topic array
        bytes32[] storage topicClaims = _claimsByTopic[topic];
        for (uint256 i = 0; i < topicClaims.length; i++) {
            if (topicClaims[i] == claimId) {
                topicClaims[i] = topicClaims[topicClaims.length - 1];
                topicClaims.pop();
                break;
            }
        }

        emit ClaimRemoved(claimId, claim.topic, claim.scheme, claim.issuer, claim.signature, claim.data, claim.uri);
        delete _claims[claimId];
        return true;
    }

    function getClaim(bytes32 claimId)
        external
        view
        override
        returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri)
    {
        Claim storage claim = _claims[claimId];
        return (claim.topic, claim.scheme, claim.issuer, claim.signature, claim.data, claim.uri);
    }

    function getClaimIdsByTopic(uint256 topic) external view override returns (bytes32[] memory) {
        return _claimsByTopic[topic];
    }
}
