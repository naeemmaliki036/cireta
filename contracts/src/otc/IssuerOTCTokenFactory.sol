// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./IssuerOTCToken.sol";

/// @title IssuerOTCTokenFactory
/// @notice Platform-level factory for deploying IssuerOTCToken proxies.
///         Each issuer gets one OTC token contract. Only the platform owner
///         can deploy new OTC tokens.
contract IssuerOTCTokenFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public otcTokenImplementation;

    /// @notice Mapping from issuer wallet => deployed OTC token address
    mapping(address => address) public issuerOTCTokens;

    /// @notice All deployed OTC token addresses
    address[] public allOTCTokens;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // --- Events ---
    event OTCTokenDeployed(address indexed issuer, address indexed otcToken);

    // --- Errors ---
    error ZeroAddress();
    error AlreadyDeployed(address issuer);
    error NoImplementation();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the factory proxy.
    /// @param initialOwner       Platform admin address
    /// @param _otcTokenImpl      IssuerOTCToken implementation address
    function initialize(
        address initialOwner,
        address _otcTokenImpl
    ) public initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_otcTokenImpl == address(0)) revert ZeroAddress();

        __Ownable_init(initialOwner);
        otcTokenImplementation = _otcTokenImpl;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Update the OTC token implementation for future deployments.
    function setOTCTokenImplementation(address impl) external onlyOwner {
        if (impl == address(0)) revert ZeroAddress();
        otcTokenImplementation = impl;
    }

    /// @notice Deploy a new OTC token proxy for an issuer.
    /// @param name              Token name
    /// @param symbol            Token symbol
    /// @param issuerWallet      Issuer wallet (receives MINTER_ROLE)
    /// @param identityRegistry  Identity registry for transfer gating
    /// @return otcToken         Address of the deployed proxy
    function deployOTCToken(
        string calldata name,
        string calldata symbol,
        address issuerWallet,
        address identityRegistry
    ) external onlyOwner returns (address otcToken) {
        if (otcTokenImplementation == address(0)) revert NoImplementation();
        if (issuerWallet == address(0)) revert ZeroAddress();
        if (identityRegistry == address(0)) revert ZeroAddress();
        if (issuerOTCTokens[issuerWallet] != address(0)) revert AlreadyDeployed(issuerWallet);

        bytes memory initData = abi.encodeCall(
            IssuerOTCToken.initialize,
            (name, symbol, issuerWallet, identityRegistry)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(otcTokenImplementation, initData);
        otcToken = address(proxy);

        issuerOTCTokens[issuerWallet] = otcToken;
        allOTCTokens.push(otcToken);

        emit OTCTokenDeployed(issuerWallet, otcToken);
    }

    /// @notice Get total number of deployed OTC tokens.
    function totalOTCTokens() external view returns (uint256) {
        return allOTCTokens.length;
    }
}
