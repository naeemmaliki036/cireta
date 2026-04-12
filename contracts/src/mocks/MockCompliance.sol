// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Mock compliance that allows everything. For tests only.
contract MockCompliance {
    function transferred(address, address, uint256) external {}
    function created(address, uint256) external {}
    function destroyed(address, uint256) external {}
    function canTransfer(address, address, uint256) external pure returns (bool) {
        return true;
    }
    function bindToken(address) external {}
    function unbindToken(address) external {}
}
