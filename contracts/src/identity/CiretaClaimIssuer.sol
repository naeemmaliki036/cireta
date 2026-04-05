// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IClaimIssuer.sol";
import "../interfaces/IIdentity.sol";

/// @title CiretaClaimIssuer
/// @notice Cireta's claim issuer identity. Signs and validates KYC/AML claims.
///         Added to TrustedIssuersRegistry so the platform can verify investor claims.
///
///         Claim signing flow:
///         1. Backend verifies investor via Sumsub
///         2. Backend signs claim data with the claim signer key
///         3. Backend calls investor.onchainID.addClaim() with signed claim
///         4. IdentityRegistry validates claim via this contract's isClaimValid()
contract CiretaClaimIssuer is IClaimIssuer, Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // Claim signer address — the key that signs claims (can be different from owner)
    address public claimSigner;

    // Revoked claim signatures
    mapping(bytes32 => bool) private _revokedSignatures;

    // Claims stored on this identity (for IIdentity interface compatibility)
    mapping(bytes32 => IIdentity.Claim) private _claims;
    mapping(uint256 => bytes32[]) private _claimsByTopic;

    uint256[50] private __gap;

    event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);

    error ZeroAddress();
    error InvalidSignature();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _owner, address _claimSigner) external initializer {
        if (_owner == address(0) || _claimSigner == address(0)) revert ZeroAddress();
        __Ownable_init(_owner);
        claimSigner = _claimSigner;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Update the claim signing key. Only owner.
    function setClaimSigner(address _newSigner) external onlyOwner {
        if (_newSigner == address(0)) revert ZeroAddress();
        emit ClaimSignerUpdated(claimSigner, _newSigner);
        claimSigner = _newSigner;
    }

    // ── Signature Recovery ──────────────────────────────────────────────────

    function _recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid v value");
        return ecrecover(
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)),
            v, r, s
        );
    }

    // ── IClaimIssuer Implementation ─────────────────────────────────────────

    /// @notice Validate a claim. Checks:
    ///         1. Signature not revoked
    ///         2. Recovered signer matches claimSigner
    function isClaimValid(
        IIdentity identity,
        uint256 claimTopic,
        bytes calldata sig,
        bytes calldata data
    ) external view override returns (bool) {
        bytes32 sigHash = keccak256(sig);
        if (_revokedSignatures[sigHash]) return false;

        bytes32 dataHash = keccak256(abi.encode(address(identity), claimTopic, data));
        address recovered = _recoverSigner(dataHash, sig);
        return recovered == claimSigner;
    }

    function revokeClaim(bytes32 claimId, address identity) external override onlyOwner returns (bool) {
        (,, address issuer, bytes memory sig,,) = IIdentity(identity).getClaim(claimId);
        require(issuer == address(this), "Not our claim");
        _revokedSignatures[keccak256(sig)] = true;
        emit ClaimRevoked(sig);
        return true;
    }

    function revokeClaimBySignature(bytes calldata signature) external override onlyOwner {
        _revokedSignatures[keccak256(signature)] = true;
        emit ClaimRevoked(signature);
    }

    function isClaimRevoked(bytes calldata signature) external view override returns (bool) {
        return _revokedSignatures[keccak256(signature)];
    }

    function getRecoveredAddress(bytes calldata sig, bytes32 dataHash) external pure override returns (address) {
        return CiretaClaimIssuer(address(0))._recoverSignerStatic(dataHash, sig);
    }

    // Static helper for getRecoveredAddress (can't call internal from external pure)
    function _recoverSignerStatic(bytes32 hash, bytes calldata sig) external pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)), v, r, s);
    }

    // ── IIdentity Implementation (minimal) ──────────────────────────────────

    function addClaim(
        uint256 topic, uint256 scheme, address issuer,
        bytes calldata signature, bytes calldata data, string calldata uri
    ) external override returns (bytes32 claimId) {
        require(msg.sender == issuer || msg.sender == owner(), "Not authorized");
        claimId = keccak256(abi.encode(issuer, topic));
        _claims[claimId] = Claim(topic, scheme, issuer, signature, data, uri);
        _claimsByTopic[topic].push(claimId);
        emit ClaimAdded(claimId, topic, scheme, issuer, signature, data, uri);
    }

    function removeClaim(bytes32 claimId) external override returns (bool) {
        require(msg.sender == _claims[claimId].issuer || msg.sender == owner(), "Not authorized");
        delete _claims[claimId];
        return true;
    }

    function getClaim(bytes32 claimId) external view override returns (
        uint256, uint256, address, bytes memory, bytes memory, string memory
    ) {
        Claim storage c = _claims[claimId];
        return (c.topic, c.scheme, c.issuer, c.signature, c.data, c.uri);
    }

    function getClaimIdsByTopic(uint256 topic) external view override returns (bytes32[] memory) {
        return _claimsByTopic[topic];
    }
}
