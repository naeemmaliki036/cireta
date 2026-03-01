// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title CiretaSaleFactory
 * @dev Platform-level factory for deploying Sale contracts per token.
 * Deploys UUPS proxies pointing to the shared Sale implementation.
 */
contract CiretaSaleFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public saleImplementation;

    mapping(address => address[]) public tokenSales;
    address[] public allSales;

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

    /**
     * @dev Deploy a new Sale proxy for a given token.
     * @param token          The ERC-3643 token address.
     * @param paymentToken   USDC or other payment token address.
     * @param issuer         Issuer wallet address (becomes sale owner).
     * @param softCap        Minimum raise target (in payment token decimals).
     * @param hardCap        Maximum raise target.
     * @param initData       ABI-encoded Sale.initialize() calldata.
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

    function getSalesForToken(address token) external view returns (address[] memory) {
        return tokenSales[token];
    }

    function totalSales() external view returns (uint256) {
        return allSales.length;
    }
}
