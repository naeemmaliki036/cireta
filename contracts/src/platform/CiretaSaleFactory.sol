// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../sale/Sale.sol";
import "./CiretaFractionFactory.sol";
import "./IssuerRegistry.sol";
import "./PlatformFeeManager.sol";

/**
 * @title CiretaSaleFactory
 * @dev Platform-level factory for deploying Sale contracts per token.
 *      Active issuers (registered in IssuerRegistry) deploy their own sales.
 *      Platform admin (owner) retains oversight via Sale.admin role.
 *      Fees are enforced on-chain via PlatformFeeManager verification.
 */
contract CiretaSaleFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public saleImplementation;
    CiretaFractionFactory public fractionFactory;

    mapping(address => address[]) public tokenSales;
    address[] public allSales;

    // Issuer-centric deployment
    IssuerRegistry public issuerRegistry;
    PlatformFeeManager public platformFeeManager;
    mapping(address => address[]) public issuerSales;

    /// @dev Reserved storage gap for future upgrades
    uint256[47] private __gap;

    event SaleDeployed(
        address indexed token,
        address indexed sale,
        address indexed issuer
    );
    event IssuerRegistrySet(address indexed registry);
    event PlatformFeeManagerSet(address indexed feeManager);

    error NotActiveIssuer();
    error FeeMismatch();
    error IssuerMismatch();
    error FactoryMismatch();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address initialOwner,
        address _saleImplementation
    ) public initializer {
        __Ownable_init(initialOwner);
        saleImplementation = _saleImplementation;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── Configuration (admin-only) ──────────────────────────────────────────

    function setSaleImplementation(address impl) external onlyOwner {
        require(impl != address(0), "zero impl");
        saleImplementation = impl;
    }

    function setFractionFactory(address _fractionFactory) external onlyOwner {
        require(_fractionFactory != address(0), "zero addr");
        fractionFactory = CiretaFractionFactory(_fractionFactory);
    }

    function setIssuerRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "zero addr");
        issuerRegistry = IssuerRegistry(_registry);
        emit IssuerRegistrySet(_registry);
    }

    function setPlatformFeeManager(address _feeManager) external onlyOwner {
        require(_feeManager != address(0), "zero addr");
        platformFeeManager = PlatformFeeManager(_feeManager);
        emit PlatformFeeManagerSet(_feeManager);
    }

    // ── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyActiveIssuer() {
        if (address(issuerRegistry) == address(0) || !issuerRegistry.isActiveIssuer(msg.sender)) {
            revert NotActiveIssuer();
        }
        _;
    }

    // ── Sale Deployment (issuer-initiated) ──────────────────────────────────

    /**
     * @dev Deploy a new Direct-mode Sale proxy.
     *      Called by active issuers. initData must encode Sale.initialize()
     *      with issuer=msg.sender, factory=address(this), and correct fee.
     *      Factory verifies these after deployment.
     */
    function deploySale(
        address token,
        bytes calldata initData
    ) external onlyActiveIssuer returns (address sale) {
        require(saleImplementation != address(0), "no impl");
        require(token != address(0), "zero token");

        ERC1967Proxy proxy = new ERC1967Proxy(saleImplementation, initData);
        sale = address(proxy);

        _verifySale(sale);

        tokenSales[token].push(sale);
        allSales.push(sale);
        issuerSales[msg.sender].push(sale);

        emit SaleDeployed(token, sale, msg.sender);
    }

    /**
     * @dev Deploy a new Vested-mode Sale proxy with vault + fraction token.
     *      Called by active issuers. initData must encode Sale.initialize()
     *      with factory=address(this). Factory calls setVestedMode() which
     *      passes adminOnly because _isAdmin() treats the factory as admin.
     */
    function deploySaleVested(
        address token,
        bytes calldata initData,
        string memory fractionName,
        string memory fractionSymbol,
        uint8 fractionDecimals,
        address identityRegistry,
        uint256 cliffDuration,
        uint256 vestingDuration,
        CiretaVault.ExcessPolicy excessPolicy
    ) external onlyActiveIssuer returns (address sale, address vaultAddr, address fractionAddr) {
        require(saleImplementation != address(0), "no impl");
        require(address(fractionFactory) != address(0), "no fraction factory");
        require(token != address(0), "zero token");

        // Deploy Sale proxy — factory=address(this) in initData
        ERC1967Proxy proxy = new ERC1967Proxy(saleImplementation, initData);
        sale = address(proxy);

        // Verify issuer, factory, and fee
        _verifySale(sale);

        // Deploy vault + fraction via CiretaFractionFactory
        (fractionAddr, vaultAddr) = fractionFactory.deployVaultAndFraction(
            fractionName, fractionSymbol, fractionDecimals,
            token, identityRegistry, sale,
            cliffDuration, vestingDuration, excessPolicy, owner()
        );

        // Configure vested mode — factory is recognized as admin via _isAdmin()
        Sale(sale).setVestedMode(vaultAddr, fractionAddr);

        tokenSales[token].push(sale);
        allSales.push(sale);
        issuerSales[msg.sender].push(sale);

        emit SaleDeployed(token, sale, msg.sender);
    }

    // ── Internal Verification ───────────────────────────────────────────────

    /// @dev Verify deployed Sale has correct issuer, factory, and fee.
    function _verifySale(address sale) internal view {
        Sale saleContract = Sale(sale);

        // Issuer must be the caller
        if (saleContract.issuer() != msg.sender) revert IssuerMismatch();

        // Factory must be this contract (admin is resolved via factory.owner())
        if (saleContract.factory() != address(this)) revert FactoryMismatch();

        // Fee must match PlatformFeeManager
        if (address(platformFeeManager) != address(0)) {
            uint256 expectedFee = platformFeeManager.getFeeForIssuer(msg.sender);
            if (saleContract.feeBasisPoints() != expectedFee) revert FeeMismatch();
        }
    }

    // ── View ────────────────────────────────────────────────────────────────

    function getSalesForToken(address token) external view returns (address[] memory) {
        return tokenSales[token];
    }

    function getSalesForIssuer(address issuerAddr) external view returns (address[] memory) {
        return issuerSales[issuerAddr];
    }

    function totalSales() external view returns (uint256) {
        return allSales.length;
    }
}
