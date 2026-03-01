// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IComplianceModule.sol";
import "../interfaces/IToken.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/ICompliance.sol";

/**
 * @title CountryAllowModule
 * @dev Compliance module that restricts transfers to allowed countries only
 */
contract CountryAllowModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    // Compliance contracts bound to this module
    mapping(address => bool) private _complianceBound;

    // Compliance => allowed countries
    mapping(address => mapping(uint16 => bool)) private _allowedCountries;

    // Events
    event CountryAllowed(address indexed compliance, uint16 indexed country);
    event CountryDisallowed(address indexed compliance, uint16 indexed country);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function name() external pure override returns (string memory) {
        return "CountryAllowModule";
    }

    // ============ Compliance Binding ============

    function bindCompliance(address compliance) external override {
        require(compliance != address(0), "zero address");
        _complianceBound[compliance] = true;
        emit ComplianceBound(compliance);
    }

    function unbindCompliance(address compliance) external override {
        require(_complianceBound[compliance], "not bound");
        _complianceBound[compliance] = false;
        emit ComplianceUnbound(compliance);
    }

    function isComplianceBound(address compliance) external view override returns (bool) {
        return _complianceBound[compliance];
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    // ============ Country Management ============

    function addAllowedCountry(
        address compliance,
        uint16 country
    ) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        _allowedCountries[compliance][country] = true;
        emit CountryAllowed(compliance, country);
    }

    function removeAllowedCountry(
        address compliance,
        uint16 country
    ) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        _allowedCountries[compliance][country] = false;
        emit CountryDisallowed(compliance, country);
    }

    function batchAllowCountries(
        address compliance,
        uint16[] calldata countries
    ) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        for (uint256 i = 0; i < countries.length; i++) {
            _allowedCountries[compliance][countries[i]] = true;
            emit CountryAllowed(compliance, countries[i]);
        }
    }

    function isCountryAllowed(
        address compliance,
        uint16 country
    ) external view returns (bool) {
        return _allowedCountries[compliance][country];
    }

    // ============ Module Actions ============

    function moduleTransferAction(
        address,
        address,
        uint256
    ) external override {
        // No state changes needed on transfer
    }

    function moduleMintAction(address, uint256) external override {
        // No state changes needed on mint
    }

    function moduleBurnAction(address, uint256) external override {
        // No state changes needed on burn
    }

    // ============ Transfer Check ============

    function moduleCheck(
        address from,
        address to,
        uint256,
        address compliance
    ) external view override returns (bool) {
        // Get token from compliance
        address token = ICompliance(compliance).getTokenBound();
        IIdentityRegistry registry = IToken(token).identityRegistry();

        // Check sender country (skip for minting)
        if (from != address(0)) {
            uint16 fromCountry = registry.investorCountry(from);
            if (!_allowedCountries[compliance][fromCountry]) {
                return false;
            }
        }

        // Check recipient country (skip for burning)
        if (to != address(0)) {
            uint16 toCountry = registry.investorCountry(to);
            if (!_allowedCountries[compliance][toCountry]) {
                return false;
            }
        }

        return true;
    }
}
