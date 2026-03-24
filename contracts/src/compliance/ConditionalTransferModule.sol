// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IComplianceModule.sol";

/**
 * @title TransferRestrictModule
 * @dev Whitelist-based transfer restrictions — only approved sender/receiver pairs.
 */
contract ConditionalTransferModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    mapping(address => bool) private _complianceBound;
    // compliance => address => can transfer
    mapping(address => mapping(address => bool)) private _approved;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    event AddressApproved(address indexed compliance, address indexed account);
    event AddressRevoked(address indexed compliance, address indexed account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function name() external pure override returns (string memory) { return "ConditionalTransferModule"; }

    function bindCompliance(address c) external override onlyOwner { _complianceBound[c] = true; emit ComplianceBound(c); }
    function unbindCompliance(address c) external override onlyOwner { _complianceBound[c] = false; emit ComplianceUnbound(c); }
    function isComplianceBound(address c) external view override returns (bool) { return _complianceBound[c]; }
    function canComplianceBind(address) external pure override returns (bool) { return true; }

    function approveAddress(address compliance, address account) external onlyOwner {
        require(_complianceBound[compliance], "not bound");
        _approved[compliance][account] = true;
        emit AddressApproved(compliance, account);
    }

    function revokeAddress(address compliance, address account) external onlyOwner {
        require(_complianceBound[compliance], "not bound");
        _approved[compliance][account] = false;
        emit AddressRevoked(compliance, account);
    }

    function isApproved(address compliance, address account) external view returns (bool) {
        return _approved[compliance][account];
    }

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
        address from, address to, uint256, address compliance
    ) external view override returns (bool) {
        if (from == address(0) || to == address(0)) return true;
        return _approved[compliance][from] && _approved[compliance][to];
    }
}
