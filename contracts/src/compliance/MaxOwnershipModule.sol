// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IComplianceModule.sol";
import "../interfaces/IToken.sol";

/**
 * @title MaxBalanceModule
 * @dev Compliance module that caps max token balance per address.
 */
contract MaxOwnershipModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    mapping(address => bool) private _complianceBound;
    mapping(address => uint256) private _maxBalance;

    event MaxBalanceSet(address indexed compliance, uint256 maxBalance);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function name() external pure override returns (string memory) {
        return "MaxOwnershipModule";
    }

    // ============ Compliance Binding ============
    function bindCompliance(address c) external override onlyOwner { _complianceBound[c] = true; emit ComplianceBound(c); }
    function unbindCompliance(address c) external override onlyOwner { _complianceBound[c] = false; emit ComplianceUnbound(c); }
    function isComplianceBound(address c) external view override returns (bool) { return _complianceBound[c]; }
    function canComplianceBind(address) external pure override returns (bool) { return true; }

    // ============ Config ============
    function setMaxBalance(address compliance, uint256 max) external onlyOwner {
        require(_complianceBound[compliance], "not bound");
        _maxBalance[compliance] = max;
        emit MaxBalanceSet(compliance, max);
    }

    function getMaxBalance(address compliance) external view returns (uint256) {
        return _maxBalance[compliance];
    }

    // ============ Module Actions ============
    function moduleTransferAction(address, address, uint256) external override {}
    function moduleMintAction(address, uint256) external override {}
    function moduleBurnAction(address, uint256) external override {}

    // ============ Transfer Check ============
    function moduleCheck(
        address, address to, uint256 amount, address compliance
    ) external view override returns (bool) {
        uint256 max = _maxBalance[compliance];
        if (max == 0) return true; // 0 = unlimited
        if (to == address(0)) return true; // burns always ok

        address token = ICompliance(compliance).getTokenBound();
        uint256 currentBalance = IToken(token).balanceOf(to);
        return currentBalance + amount <= max;
    }
}
