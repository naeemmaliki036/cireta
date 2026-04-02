// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../token/CiretaToken.sol";
import "../token/IdentityRegistry.sol";
import "../token/ModularCompliance.sol";

/**
 * @title CiretaTokenFactory
 * @dev Factory for deploying ERC-3643 compliant tokens.
 *      Canonical token implementation: ../token/CiretaToken.sol
 *      Canonical identity registry: ../token/IdentityRegistry.sol
 *      Canonical compliance: ../token/ModularCompliance.sol
 */
contract CiretaTokenFactory is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // Implementation contracts
    address public tokenImplementation;
    address public identityRegistryImplementation;
    address public complianceImplementation;

    // Platform registries (shared)
    address public claimTopicsRegistry;
    address public trustedIssuersRegistry;
    address public identityRegistryStorage;
    address public issuerRegistry;

    // Deployed tokens
    address[] public deployedTokens;
    mapping(address => bool) public isDeployedToken;

    /// @dev When true, uses SimpleIdentityRegistry (whitelist mode).
    ///      When false, uses full IdentityRegistry (ERC-3643 ONCHAINID mode).
    bool public simpleIdentityMode;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // Events
    event TokenDeployed(
        address indexed token,
        address indexed identityRegistry,
        address indexed compliance,
        string name,
        string symbol,
        address issuer
    );
    event ImplementationsUpdated(
        address token,
        address identityRegistry,
        address compliance
    );
    event IdentityModeChanged(bool simpleMode);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address _tokenImpl,
        address _identityRegistryImpl,
        address _complianceImpl,
        address _claimTopicsRegistry,
        address _trustedIssuersRegistry,
        address _identityRegistryStorage,
        address _issuerRegistry
    ) public initializer {
        __Ownable_init(initialOwner);

        tokenImplementation = _tokenImpl;
        identityRegistryImplementation = _identityRegistryImpl;
        complianceImplementation = _complianceImpl;
        claimTopicsRegistry = _claimTopicsRegistry;
        trustedIssuersRegistry = _trustedIssuersRegistry;
        identityRegistryStorage = _identityRegistryStorage;
        issuerRegistry = _issuerRegistry;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Toggle between simple whitelist mode and full ERC-3643 ONCHAINID mode.
     *      Only affects NEW token deployments — existing tokens keep their registry.
     */
    function setSimpleIdentityMode(bool _simpleMode) external onlyOwner {
        simpleIdentityMode = _simpleMode;
        emit IdentityModeChanged(_simpleMode);
    }

    function updateImplementations(
        address _tokenImpl,
        address _identityRegistryImpl,
        address _complianceImpl
    ) external onlyOwner {
        if (_tokenImpl != address(0)) {
            tokenImplementation = _tokenImpl;
        }
        if (_identityRegistryImpl != address(0)) {
            identityRegistryImplementation = _identityRegistryImpl;
        }
        if (_complianceImpl != address(0)) {
            complianceImplementation = _complianceImpl;
        }

        emit ImplementationsUpdated(
            tokenImplementation,
            identityRegistryImplementation,
            complianceImplementation
        );
    }

    function deployToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        address issuer
    ) external onlyOwner returns (
        address tokenProxy,
        address identityRegistryProxy,
        address complianceProxy
    ) {
        require(issuer != address(0), "zero issuer");

        // Check issuer is registered (optional check)
        // require(IIssuerRegistry(issuerRegistry).isActiveIssuer(issuer), "issuer not active");

        // Deploy Identity Registry (same initialize signature for both implementations)
        bytes memory irInitData = abi.encodeWithSelector(
            IdentityRegistry.initialize.selector,
            issuer,
            claimTopicsRegistry,
            trustedIssuersRegistry,
            identityRegistryStorage
        );
        identityRegistryProxy = address(
            new ERC1967Proxy(identityRegistryImplementation, irInitData)
        );

        // Deploy Compliance — initialize with factory as temporary owner so we can call bindToken()
        bytes memory compInitData = abi.encodeWithSelector(
            ModularCompliance.initialize.selector,
            address(this)
        );
        complianceProxy = address(
            new ERC1967Proxy(complianceImplementation, compInitData)
        );

        // Deploy Token — issuer gets all roles, platform admin gets oversight roles (not SUPPLY_ROLE)
        bytes memory tokenInitData = abi.encodeWithSelector(
            CiretaToken.initialize.selector,
            name,
            symbol,
            decimals,
            identityRegistryProxy,
            complianceProxy,
            issuer,
            owner()
        );
        tokenProxy = address(
            new ERC1967Proxy(tokenImplementation, tokenInitData)
        );

        // Bind token to compliance (factory is owner, so this succeeds)
        ModularCompliance(complianceProxy).bindToken(tokenProxy);

        // Transfer compliance ownership to the issuer
        ModularCompliance(complianceProxy).transferOwnership(issuer);

        // Bind identity registry to shared storage (only in full ERC-3643 mode)
        if (!simpleIdentityMode) {
            IIdentityRegistryStorage(identityRegistryStorage).bindIdentityRegistry(
                identityRegistryProxy
            );
        }

        // Track deployment
        deployedTokens.push(tokenProxy);
        isDeployedToken[tokenProxy] = true;

        emit TokenDeployed(
            tokenProxy,
            identityRegistryProxy,
            complianceProxy,
            name,
            symbol,
            issuer
        );

        return (tokenProxy, identityRegistryProxy, complianceProxy);
    }

    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    function getDeployedTokens(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        uint256 total = deployedTokens.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = deployedTokens[i];
        }

        return result;
    }
}
