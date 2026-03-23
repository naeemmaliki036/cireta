// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/ICompliance.sol";
import "../interfaces/IComplianceModule.sol";

/**
 * @title ModularCompliance
 * @dev Compliance contract with pluggable modules for transfer validation
 */
contract ModularCompliance is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ICompliance
{
    // Bound token
    address private _tokenBound;

    // Compliance modules
    address[] private _modules;

    // Module bound status
    mapping(address => bool) private _moduleBound;

    modifier onlyToken() {
        require(msg.sender == _tokenBound, "only token");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Token Binding ============

    function bindToken(address token) external override onlyOwner {
        require(token != address(0), "zero address");
        require(_tokenBound == address(0), "token already bound");

        _tokenBound = token;

        emit TokenBound(token);
    }

    function unbindToken(address token) external override onlyOwner {
        require(token == _tokenBound, "not bound token");

        _tokenBound = address(0);

        emit TokenUnbound(token);
    }

    function getTokenBound() external view override returns (address) {
        return _tokenBound;
    }

    // ============ Module Management ============

    function addModule(address module) external override onlyOwner {
        require(module != address(0), "zero address");
        require(!_moduleBound[module], "module already bound");
        require(
            IComplianceModule(module).canComplianceBind(address(this)),
            "cannot bind compliance"
        );

        _modules.push(module);
        _moduleBound[module] = true;
        // NOTE: Owner must call module.bindCompliance(address(this)) separately
        // since compliance modules restrict binding to onlyOwner.

        emit ModuleAdded(module);
    }

    function removeModule(address module) external override onlyOwner {
        require(_moduleBound[module], "module not bound");

        _moduleBound[module] = false;
        // NOTE: Owner must call module.unbindCompliance(address(this)) separately
        // since compliance modules restrict unbinding to onlyOwner.

        // Remove from array
        uint256 length = _modules.length;
        for (uint256 i = 0; i < length; i++) {
            if (_modules[i] == module) {
                _modules[i] = _modules[length - 1];
                _modules.pop();
                break;
            }
        }

        emit ModuleRemoved(module);
    }

    function getModules() external view override returns (address[] memory) {
        return _modules;
    }

    function isModuleBound(address module) external view override returns (bool) {
        return _moduleBound[module];
    }

    // Allowed function selectors that can be called via callModuleFunction
    mapping(bytes4 => bool) private _allowedSelectors;

    function setAllowedSelector(bytes4 selector, bool allowed) external onlyOwner {
        _allowedSelectors[selector] = allowed;
    }

    function callModuleFunction(
        bytes calldata callData,
        address module
    ) external override onlyOwner {
        require(_moduleBound[module], "module not bound");
        require(callData.length >= 4, "calldata too short");
        bytes4 selector = bytes4(callData[:4]);
        require(_allowedSelectors[selector], "selector not allowed");

        (bool success, ) = module.call(callData);
        require(success, "module call failed");
    }

    // ============ Transfer Hooks ============

    function transferred(
        address from,
        address to,
        uint256 amount
    ) external override onlyToken {
        for (uint256 i = 0; i < _modules.length; i++) {
            IComplianceModule(_modules[i]).moduleTransferAction(from, to, amount);
        }
    }

    function created(address to, uint256 amount) external override onlyToken {
        for (uint256 i = 0; i < _modules.length; i++) {
            IComplianceModule(_modules[i]).moduleMintAction(to, amount);
        }
    }

    function destroyed(address from, uint256 amount) external override onlyToken {
        for (uint256 i = 0; i < _modules.length; i++) {
            IComplianceModule(_modules[i]).moduleBurnAction(from, amount);
        }
    }

    // ============ Transfer Validation ============

    function canTransfer(
        address from,
        address to,
        uint256 amount
    ) external view override returns (bool) {
        for (uint256 i = 0; i < _modules.length; i++) {
            if (
                !IComplianceModule(_modules[i]).moduleCheck(
                    from,
                    to,
                    amount,
                    address(this)
                )
            ) {
                return false;
            }
        }
        return true;
    }
}
