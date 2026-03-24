// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../sale/Sale.sol";
import "./CiretaFractionFactory.sol";

/**
 * @title CiretaSaleFactory
 * @dev Platform-level factory for deploying Sale contracts per token.
 *      Deploys UUPS proxies pointing to the shared Sale implementation.
 *      For Vested mode, coordinates with CiretaFractionFactory to deploy
 *      vault + fraction token pairs.
 */
contract CiretaSaleFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public saleImplementation;
    CiretaFractionFactory public fractionFactory;

    mapping(address => address[]) public tokenSales;
    address[] public allSales;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    event SaleDeployed(
        address indexed token,
        address indexed sale,
        address indexed issuer
    );

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

    function setSaleImplementation(address impl) external onlyOwner {
        require(impl != address(0), "zero impl");
        saleImplementation = impl;
    }

    function setFractionFactory(address _fractionFactory) external onlyOwner {
        require(_fractionFactory != address(0), "zero addr");
        fractionFactory = CiretaFractionFactory(_fractionFactory);
    }

    /**
     * @dev Deploy a new Direct-mode Sale proxy for a given token.
     *      Backward compatible — existing callers unaffected.
     */
    function deploySale(
        address token,
        address paymentToken,
        address issuer,
        uint256 softCap,
        uint256 hardCap,
        bytes calldata initData
    ) external onlyOwner returns (address sale) {
        require(saleImplementation != address(0), "no impl");
        require(token != address(0), "zero token");
        require(issuer != address(0), "zero issuer");
        require(hardCap >= softCap, "hard < soft");

        ERC1967Proxy proxy = new ERC1967Proxy(saleImplementation, initData);
        sale = address(proxy);

        tokenSales[token].push(sale);
        allSales.push(sale);

        emit SaleDeployed(token, sale, issuer);
    }

    /**
     * @dev Deploy a new Vested-mode Sale proxy with vault + fraction token.
     *      Deploys Sale proxy, then uses CiretaFractionFactory to create
     *      vault + fraction pair, then configures vested mode on the Sale.
     */
    function deploySaleVested(
        address token,
        address paymentToken,
        address issuer,
        uint256 softCap,
        uint256 hardCap,
        bytes calldata initData,
        string memory fractionName,
        string memory fractionSymbol,
        uint8 fractionDecimals,
        address identityRegistry,
        uint256 cliffDuration,
        uint256 vestingDuration,
        CiretaVault.ExcessPolicy excessPolicy
    ) external onlyOwner returns (address sale, address vaultAddr, address fractionAddr) {
        require(saleImplementation != address(0), "no impl");
        require(address(fractionFactory) != address(0), "no fraction factory");
        require(token != address(0), "zero token");
        require(issuer != address(0), "zero issuer");
        require(hardCap >= softCap, "hard < soft");

        // Deploy Sale proxy
        ERC1967Proxy proxy = new ERC1967Proxy(saleImplementation, initData);
        sale = address(proxy);

        // Deploy vault + fraction via CiretaFractionFactory
        (fractionAddr, vaultAddr) = fractionFactory.deployVaultAndFraction(
            fractionName, fractionSymbol, fractionDecimals,
            token, identityRegistry, sale,
            cliffDuration, vestingDuration, excessPolicy, issuer
        );

        // Configure vested mode on the Sale
        Sale(sale).setVestedMode(vaultAddr, fractionAddr);

        tokenSales[token].push(sale);
        allSales.push(sale);

        emit SaleDeployed(token, sale, issuer);
    }

    function getSalesForToken(address token) external view returns (address[] memory) {
        return tokenSales[token];
    }

    function totalSales() external view returns (uint256) {
        return allSales.length;
    }
}
