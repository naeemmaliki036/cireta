// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./OnchainID.sol";

/// @title OnchainIDFactory
/// @notice Deploys ONCHAINID proxy contracts for investors.
///         Called by the platform backend after KYC approval.
contract OnchainIDFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    address public implementation;

    mapping(address => address) public identities; // wallet => ONCHAINID
    uint256 public totalDeployed;

    uint256[50] private __gap;

    event IdentityDeployed(address indexed wallet, address indexed identity);

    error AlreadyDeployed();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _implementation, address _owner) external initializer {
        if (_implementation == address(0) || _owner == address(0)) revert ZeroAddress();
        __Ownable_init(_owner);
        implementation = _implementation;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Deploy an ONCHAINID for an investor. Only owner (platform).
    ///         The investor wallet becomes the owner of their ONCHAINID.
    /// @param wallet The investor's wallet address (will own the ONCHAINID)
    /// @return identity The deployed ONCHAINID proxy address
    function deployIdentity(address wallet) external onlyOwner returns (address identity) {
        if (wallet == address(0)) revert ZeroAddress();
        if (identities[wallet] != address(0)) revert AlreadyDeployed();

        bytes memory initData = abi.encodeCall(OnchainID.initialize, (wallet));
        ERC1967Proxy proxy = new ERC1967Proxy(implementation, initData);
        identity = address(proxy);

        identities[wallet] = identity;
        totalDeployed++;

        emit IdentityDeployed(wallet, identity);
    }

    /// @notice Get the ONCHAINID address for a wallet. Returns address(0) if not deployed.
    function getIdentity(address wallet) external view returns (address) {
        return identities[wallet];
    }
}
