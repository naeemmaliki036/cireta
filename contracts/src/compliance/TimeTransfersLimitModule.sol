// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IComplianceModule.sol";

/**
 * @title TimeTransfersLimitModule
 * @dev Transfers only allowed after a per-compliance time lock.
 */
contract TimeTransfersLimitModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    mapping(address => bool) private _complianceBound;
    // compliance => unlock timestamp (block.timestamp after which transfers are allowed)
    mapping(address => uint256) private _unlockTime;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    event TimeLockSet(address indexed compliance, uint256 unlockTime);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function name() external pure override returns (string memory) { return "TimeTransfersLimitModule"; }

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
    function setUnlockTime(address compliance, uint256 timestamp) external complianceAdmin(compliance) {
        require(timestamp > block.timestamp, "must be in the future");
        _unlockTime[compliance] = timestamp;
        emit TimeLockSet(compliance, timestamp);
    }

    function getUnlockTime(address compliance) external view returns (uint256) {
        return _unlockTime[compliance];
    }

    function isUnlocked(address compliance) external view returns (bool) {
        return block.timestamp >= _unlockTime[compliance];
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
        if (from == address(0)) return true; // mints always ok
        uint256 unlock = _unlockTime[compliance];
        if (unlock == 0) return true; // no lock set
        return block.timestamp >= unlock;
    }
}
