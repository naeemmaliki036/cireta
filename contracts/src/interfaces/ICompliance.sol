// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICompliance
 * @dev Interface for Modular Compliance in ERC-3643
 */
interface ICompliance {
    // Events
    event TokenBound(address indexed token);
    event TokenUnbound(address indexed token);
    event ModuleAdded(address indexed module);
    event ModuleRemoved(address indexed module);

    // Functions
    function bindToken(address token) external;

    function unbindToken(address token) external;

    function addModule(address module) external;

    function removeModule(address module) external;

    function callModuleFunction(
        bytes calldata callData,
        address module
    ) external;

    function transferred(
        address from,
        address to,
        uint256 amount
    ) external;

    function created(address to, uint256 amount) external;

    function destroyed(address from, uint256 amount) external;

    function canTransfer(
        address from,
        address to,
        uint256 amount
    ) external view returns (bool);

    function isModuleBound(address module) external view returns (bool);

    function getModules() external view returns (address[] memory);

    function getTokenBound() external view returns (address);
}
