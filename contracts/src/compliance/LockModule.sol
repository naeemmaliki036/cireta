// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IComplianceModule.sol";

/**
 * @title LockModule
 * @dev Compliance module that locks tokens for specific addresses (no transfers out).
 */
contract LockModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    mapping(address => bool) private _complianceBound;
    // compliance => address => locked
    mapping(address => mapping(address => bool)) private _locked;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    event AddressLocked(address indexed compliance, address indexed account);
    event AddressUnlocked(address indexed compliance, address indexed account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function name() external pure override returns (string memory) { return "LockModule"; }

    // ============ Access Modifiers ============

    /// @dev Allows platform admin OR the issuer who owns the bound compliance contract.
    modifier complianceAdmin(address compliance) {
        require(
            msg.sender == owner() ||
            msg.sender == Ownable(compliance).owner(),
            "not authorized"
        );
        require(_complianceBound[compliance], "compliance not bound");
        _;
    }

    /// @dev Allows platform admin OR the issuer who owns the compliance contract.
    ///      Does NOT require the compliance to be bound yet.
    modifier complianceBinder(address compliance) {
        require(
            msg.sender == owner() ||
            msg.sender == Ownable(compliance).owner(),
            "not authorized"
        );
        _;
    }

    // ============ Compliance Binding ============
    function bindCompliance(address c) external override complianceBinder(c) { _complianceBound[c] = true; emit ComplianceBound(c); }
    function unbindCompliance(address c) external override complianceAdmin(c) { _complianceBound[c] = false; emit ComplianceUnbound(c); }
    function isComplianceBound(address c) external view override returns (bool) { return _complianceBound[c]; }
    function canComplianceBind(address) external pure override returns (bool) { return true; }

    // ============ Per-compliance Config ============
    function lockAddress(address compliance, address account) external complianceAdmin(compliance) {
        _locked[compliance][account] = true;
        emit AddressLocked(compliance, account);
    }

    function unlockAddress(address compliance, address account) external complianceAdmin(compliance) {
        _locked[compliance][account] = false;
        emit AddressUnlocked(compliance, account);
    }

    function isLocked(address compliance, address account) external view returns (bool) {
        return _locked[compliance][account];
    }

    // ============ Module Actions ============
    function moduleTransferAction(address, address, uint256) external override {
        require(_complianceBound[msg.sender], "not bound");
    }
    function moduleMintAction(address, uint256) external override {
        require(_complianceBound[msg.sender], "not bound");
    }
    function moduleBurnAction(address, uint256) external override {
        require(_complianceBound[msg.sender], "not bound");
    }

    function moduleCheck(
        address from, address, uint256, address compliance
    ) external view override returns (bool) {
        if (from == address(0)) return true; // mints ok
        return !_locked[compliance][from];
    }
}
