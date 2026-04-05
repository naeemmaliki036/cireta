// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal mock that exposes owner() for Sale's admin() lookup in tests.
contract MockSaleFactory {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }
}
