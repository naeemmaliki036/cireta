// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IComplianceModule.sol";
import "../interfaces/IToken.sol";
import "../interfaces/ICompliance.sol";

/**
 * @title MaxHolderCountModule
 * @dev Compliance module that limits the maximum number of token holders
 */
contract MaxHolderCountModule is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IComplianceModule
{
    // Compliance contracts bound to this module
    mapping(address => bool) private _complianceBound;

    // Compliance => max holder count
    mapping(address => uint256) private _maxHolderCount;

    // Compliance => current holder count
    mapping(address => uint256) private _holderCount;

    // Compliance => address => is holder
    mapping(address => mapping(address => bool)) private _isHolder;

    // Events
    event MaxHolderCountSet(address indexed compliance, uint256 maxCount);
    event HolderAdded(address indexed compliance, address indexed holder);
    event HolderRemoved(address indexed compliance, address indexed holder);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function name() external pure override returns (string memory) {
        return "MaxHolderCountModule";
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

    // ============ Configuration ============

    function setMaxHolderCount(
        address compliance,
        uint256 maxCount
    ) external onlyOwner {
        require(_complianceBound[compliance], "compliance not bound");
        require(maxCount > 0, "max count must be > 0");
        require(maxCount >= _holderCount[compliance], "below current count");

        _maxHolderCount[compliance] = maxCount;
        emit MaxHolderCountSet(compliance, maxCount);
    }

    function getMaxHolderCount(address compliance) external view returns (uint256) {
        return _maxHolderCount[compliance];
    }

    function getHolderCount(address compliance) external view returns (uint256) {
        return _holderCount[compliance];
    }

    // ============ Module Actions ============

    function moduleTransferAction(
        address from,
        address to,
        uint256 amount
    ) external override {
        address compliance = msg.sender;
        require(_complianceBound[compliance], "not bound");

        address token = ICompliance(compliance).getTokenBound();

        // Handle sender becoming non-holder
        if (from != address(0) && _isHolder[compliance][from]) {
            // Check if sender will have zero balance after transfer
            if (IToken(token).balanceOf(from) == amount) {
                _isHolder[compliance][from] = false;
                _holderCount[compliance]--;
                emit HolderRemoved(compliance, from);
            }
        }

        // Handle recipient becoming holder
        if (to != address(0) && !_isHolder[compliance][to]) {
            _isHolder[compliance][to] = true;
            _holderCount[compliance]++;
            emit HolderAdded(compliance, to);
        }
    }

    function moduleMintAction(address to, uint256) external override {
        address compliance = msg.sender;
        require(_complianceBound[compliance], "not bound");

        if (!_isHolder[compliance][to]) {
            _isHolder[compliance][to] = true;
            _holderCount[compliance]++;
            emit HolderAdded(compliance, to);
        }
    }

    function moduleBurnAction(address from, uint256 amount) external override {
        address compliance = msg.sender;
        require(_complianceBound[compliance], "not bound");

        address token = ICompliance(compliance).getTokenBound();

        if (_isHolder[compliance][from] && IToken(token).balanceOf(from) == amount) {
            _isHolder[compliance][from] = false;
            _holderCount[compliance]--;
            emit HolderRemoved(compliance, from);
        }
    }

    // ============ Transfer Check ============

    function moduleCheck(
        address,
        address to,
        uint256,
        address compliance
    ) external view override returns (bool) {
        // If recipient is already a holder, always allow
        if (_isHolder[compliance][to]) {
            return true;
        }

        // Check if adding new holder would exceed max
        uint256 maxCount = _maxHolderCount[compliance];
        if (maxCount == 0) {
            return true; // No limit set
        }

        return _holderCount[compliance] < maxCount;
    }
}
