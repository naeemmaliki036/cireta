// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IComplianceModule
 * @dev Interface for Compliance Modules
 */
interface IComplianceModule {
    // Events
    event ComplianceBound(address indexed compliance);
    event ComplianceUnbound(address indexed compliance);

    // Functions
    function bindCompliance(address compliance) external;

    function unbindCompliance(address compliance) external;

    function moduleTransferAction(
        address from,
        address to,
        uint256 amount
    ) external;

    function moduleMintAction(address to, uint256 amount) external;

    function moduleBurnAction(address from, uint256 amount) external;

    function moduleCheck(
        address from,
        address to,
        uint256 amount,
        address compliance
    ) external view returns (bool);

    function canComplianceBind(address compliance) external view returns (bool);

    function isComplianceBound(address compliance) external view returns (bool);

    function name() external pure returns (string memory);
}
