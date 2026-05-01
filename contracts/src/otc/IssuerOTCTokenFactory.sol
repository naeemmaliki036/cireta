// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./IssuerOTCToken.sol";
import "../platform/IssuerRegistry.sol";

/// @dev Minimal interface for the platform identity registry.
interface ISimpleIdentityRegistry {
    function addToWhitelist(address wallet, uint16 country) external;
    function isVerified(address wallet) external view returns (bool);
}

/// @title IssuerOTCTokenFactory
/// @notice Platform-level factory for deploying IssuerOTCToken proxies.
///         Each issuer can deploy multiple OTC tokens (one per sale/project).
///
/// @dev RBAC requirement: this factory must be granted REGISTRAR_ROLE (or AGENT_ROLE)
///      on the SimpleIdentityRegistry by admin after deploy so that auto-whitelisting
///      of newly deployed OTC tokens succeeds. If the role is missing, deploy still
///      succeeds but `SystemContractWhitelisted` emits `success=false` and the OTC
///      token will be unable to receive transfers until manually whitelisted.
contract IssuerOTCTokenFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public otcTokenImplementation;
    IssuerRegistry public issuerRegistry;

    /// @notice Legacy mapping — points to the latest OTC token for an issuer
    mapping(address => address) public issuerOTCTokens;

    /// @notice All deployed OTC token addresses (global)
    address[] public allOTCTokens;

    /// @notice Mapping from issuer wallet => list of all deployed OTC tokens
    mapping(address => address[]) public issuerOTCTokenList;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[100] private __gap;

    // --- Events ---
    event OTCTokenDeployed(address indexed issuer, address indexed otcToken);
    event OTCTokenImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event IssuerRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event SystemContractWhitelisted(address indexed contractAddr, address indexed registry, bool success);
    /// @notice Emitted on every UUPS upgrade. ERC1967 also emits `Upgraded(impl)`
    /// from the proxy; this is a parallel marker that includes the nonce when
    /// available, so off-chain monitors can sequence upgrade-related events.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

    // --- Errors ---
    error ZeroAddress();
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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        upgradeNonce++;
        emit ImplementationUpgraded(newImplementation, upgradeNonce);
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "5.0.0"; }

    /// @notice Update the OTC token implementation for future deployments.
    function setOTCTokenImplementation(address impl) external onlyOwner {
        if (impl == address(0)) revert ZeroAddress();
        address old = otcTokenImplementation;
        otcTokenImplementation = impl;
        emit OTCTokenImplementationUpdated(old, impl);
    }

    function setIssuerRegistry(address _registry) external onlyOwner {
        address old = address(issuerRegistry);
        issuerRegistry = IssuerRegistry(_registry);
        emit IssuerRegistryUpdated(old, _registry);
    }

    /// @notice Deploy a new OTC token proxy for an issuer.
    ///         Issuers can deploy multiple OTC tokens (one per sale/project).
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
    ) external returns (address otcToken) {
        // Allow owner (admin) or active issuers deploying for themselves
        if (msg.sender != owner()) {
            require(
                address(issuerRegistry) != address(0) &&
                issuerRegistry.isActiveIssuer(msg.sender),
                "not owner or active issuer"
            );
            require(msg.sender == issuerWallet, "issuer must be msg.sender");
        }
        if (otcTokenImplementation == address(0)) revert NoImplementation();
        if (issuerWallet == address(0)) revert ZeroAddress();
        if (identityRegistry == address(0)) revert ZeroAddress();

        bytes memory initData = abi.encodeCall(
            IssuerOTCToken.initialize,
            (name, symbol, issuerWallet, identityRegistry)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(otcTokenImplementation, initData);
        otcToken = address(proxy);

        issuerOTCTokens[issuerWallet] = otcToken; // legacy: points to latest
        issuerOTCTokenList[issuerWallet].push(otcToken);
        allOTCTokens.push(otcToken);

        emit OTCTokenDeployed(issuerWallet, otcToken);

        _tryWhitelist(identityRegistry, otcToken);
    }

    /// @dev Attempt to whitelist `contractAddr` on the given `registry` with
    ///      country code 0 ("System"). Emits `SystemContractWhitelisted` with
    ///      the outcome. Never reverts — a failed whitelist does not block deploy.
    function _tryWhitelist(address registry, address contractAddr) private {
        if (registry == address(0)) {
            emit SystemContractWhitelisted(contractAddr, registry, false);
            return;
        }
        try ISimpleIdentityRegistry(registry).addToWhitelist(contractAddr, 0) {
            emit SystemContractWhitelisted(contractAddr, registry, true);
        } catch {
            emit SystemContractWhitelisted(contractAddr, registry, false);
        }
    }

    /// @notice Get all OTC tokens deployed by an issuer.
    function getIssuerOTCTokens(address issuerWallet) external view returns (address[] memory) {
        return issuerOTCTokenList[issuerWallet];
    }

    /// @notice Get count of OTC tokens for an issuer.
    function getIssuerOTCTokenCount(address issuerWallet) external view returns (uint256) {
        return issuerOTCTokenList[issuerWallet].length;
    }

    /// @notice Get total number of deployed OTC tokens.
    function totalOTCTokens() external view returns (uint256) {
        return allOTCTokens.length;
    }
}
