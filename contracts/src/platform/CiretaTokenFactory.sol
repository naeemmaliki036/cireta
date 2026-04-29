// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../token/CiretaToken.sol";
import "../token/IdentityRegistry.sol";
import "../token/ModularCompliance.sol";
import "./IssuerRegistry.sol";

/**
 * @title CiretaTokenFactory
 * @dev Factory for deploying ERC-3643 compliant tokens.
 *      Canonical token implementation: ../token/CiretaToken.sol
 *      Canonical identity registry: ../token/IdentityRegistry.sol
 *      Canonical compliance: ../token/ModularCompliance.sol
 *
 *      RBAC requirement: this factory must be granted AGENT_ROLE (or REGISTRAR_ROLE)
 *      on the SimpleIdentityRegistry by admin after deploy so that auto-whitelisting
 *      of newly deployed token + compliance contracts succeeds atomically in deployToken().
 */

/**
 * @dev Minimal interface for the platform identity registry.
 *      Supports both SimpleIdentityRegistry (whitelist mode) and any registry
 *      exposing addToWhitelist / isVerified.
 */
interface ISimpleIdentityRegistry {
    function addToWhitelist(address wallet, uint16 country) external;
    function isVerified(address wallet) external view returns (bool);
}

/**
 * @title CiretaTokenFactory
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

    /**
     * @dev Emitted for each auto-whitelist attempt on the identity registry.
     *      success = false means the factory lacked the role — admin must grant
     *      AGENT_ROLE on the IR to this factory address post-deploy.
     */
    event SystemContractWhitelisted(
        address indexed contractAddr,
        address indexed registry,
        bool success
    );

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

    /**
     * @notice Deploy a new ERC-3643 security token with supply economics.
     *
     * @param name              ERC-20 name
     * @param symbol            ERC-20 symbol
     * @param decimals          Decimal places (max 6)
     * @param issuer            Token owner / issuer wallet; receives initial mint
     * @param identityRegistry  External IR to use. If address(0), a fresh IR is
     *                          deployed using identityRegistryImplementation (legacy path).
     * @param maxSupply         Hard cap on total supply; must be > 0
     * @param mintable          If true, more tokens can be minted up to maxSupply.
     *                          If false, minting is locked after the initial pre-mint.
     * @param initialMintAmount Tokens to pre-mint to issuer. For !mintable must equal maxSupply.
     *
     * @return tokenProxy             Deployed token proxy address
     * @return identityRegistryProxy  IR used (external or freshly deployed)
     * @return complianceProxy        Deployed compliance proxy address
     */
    function deployToken(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        address issuer,
        address identityRegistry,
        uint256 maxSupply,
        bool mintable,
        uint256 initialMintAmount
    ) external returns (
        address tokenProxy,
        address identityRegistryProxy,
        address complianceProxy
    ) {
        // ---- Input validation ----
        require(issuer != address(0), "zero issuer");
        require(maxSupply > 0, "max supply required");
        if (!mintable) {
            require(initialMintAmount == maxSupply, "fixed supply must mint full max");
        } else {
            require(initialMintAmount <= maxSupply, "initial > max");
        }

        // ---- Access control ----
        // Owner (platform admin) may deploy on behalf of any issuer.
        // Active issuers may only deploy for themselves.
        if (msg.sender != owner()) {
            require(
                issuerRegistry != address(0) &&
                IssuerRegistry(issuerRegistry).isActiveIssuer(msg.sender),
                "not owner or active issuer"
            );
            require(msg.sender == issuer, "issuer must be msg.sender");
        }

        // ---- Identity Registry ----
        if (identityRegistry != address(0)) {
            // Use externally supplied IR (e.g. the shared platform IR).
            // Safety check: must be a contract, not an EOA.
            require(identityRegistry.code.length > 0, "IR not a contract");
            identityRegistryProxy = identityRegistry;
        } else {
            // Legacy fallback: deploy a fresh IR proxy for this token.
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
        }

        // ---- Compliance ----
        // Deploy with factory as temporary owner so we can call bindToken() below.
        bytes memory compInitData = abi.encodeWithSelector(
            ModularCompliance.initialize.selector,
            address(this)
        );
        complianceProxy = address(
            new ERC1967Proxy(complianceImplementation, compInitData)
        );

        // ---- Token ----
        // Pass maxSupply + mintable + initialMintAmount so initialize() handles
        // pre-minting and optional SUPPLY_ROLE revocation atomically.
        bytes memory tokenInitData = abi.encodeWithSelector(
            CiretaToken.initialize.selector,
            name,
            symbol,
            decimals,
            identityRegistryProxy,
            complianceProxy,
            issuer,
            owner(),
            maxSupply,
            mintable,
            initialMintAmount
        );
        tokenProxy = address(
            new ERC1967Proxy(tokenImplementation, tokenInitData)
        );

        // ---- Bind token to compliance (factory is owner at this point) ----
        ModularCompliance(complianceProxy).bindToken(tokenProxy);

        // ---- Transfer compliance ownership to the issuer ----
        ModularCompliance(complianceProxy).transferOwnership(issuer);

        // ---- Bind IR to shared storage (full ERC-3643 mode only) ----
        // Only relevant when a fresh per-token IR was deployed (identityRegistry == address(0))
        // and the factory is in full ONCHAINID mode. Skipped for the shared platform IR path.
        if (!simpleIdentityMode && identityRegistry == address(0)) {
            IIdentityRegistryStorage(identityRegistryStorage).bindIdentityRegistry(
                identityRegistryProxy
            );
        }

        // ---- Auto-whitelist system contracts on the IR ----
        // The factory must hold AGENT_ROLE (or REGISTRAR_ROLE) on the IR.
        // We use try/catch so a misconfigured role doesn't brick the whole deployment.
        // Country code 0 is reserved for "System" (contract addresses).
        _tryWhitelist(identityRegistryProxy, tokenProxy);
        _tryWhitelist(identityRegistryProxy, complianceProxy);

        // ---- Track deployment ----
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

    /**
     * @dev Attempt to whitelist a system contract on the identity registry.
     *      Uses try/catch so a role misconfiguration degrades gracefully.
     *      Emits SystemContractWhitelisted with success = false on failure.
     */
    function _tryWhitelist(address registry, address contractAddr) internal {
        try ISimpleIdentityRegistry(registry).addToWhitelist(contractAddr, 0) {
            emit SystemContractWhitelisted(contractAddr, registry, true);
        } catch {
            // Factory lacks the required role on this IR.
            // Admin must grant AGENT_ROLE on the IR to this factory address.
            emit SystemContractWhitelisted(contractAddr, registry, false);
        }
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
