// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IIdentityRegistry.sol";
import "./ICompliance.sol";

/**
 * @title IToken
 * @dev Interface for ERC-3643 Token
 */
interface IToken {
    // Events
    event UpdatedTokenInformation(
        string indexed newName,
        string indexed newSymbol,
        uint8 newDecimals,
        string newVersion,
        address indexed newOnchainID
    );

    event IdentityRegistryAdded(address indexed identityRegistry);

    event ComplianceAdded(address indexed compliance);

    event RecoverySuccess(
        address indexed lostWallet,
        address indexed newWallet,
        address indexed investorOnchainID
    );

    event AddressFrozen(address indexed addr, bool indexed isFrozen, address indexed agent);

    event TokensFrozen(address indexed addr, uint256 amount);

    event TokensUnfrozen(address indexed addr, uint256 amount);

    event Paused(address indexed agent);

    event Unpaused(address indexed agent);

    // ERC-20 Functions (subset for interface)
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    // ERC-3643 Specific Functions
    function setName(string calldata newName) external;

    function setSymbol(string calldata newSymbol) external;

    function setOnchainID(address onchainID) external;

    function pause() external;

    function unpause() external;

    function setAddressFrozen(address addr, bool freeze) external;

    function freezePartialTokens(address addr, uint256 amount) external;

    function unfreezePartialTokens(address addr, uint256 amount) external;

    function setIdentityRegistry(address identityRegistry) external;

    function setCompliance(address compliance) external;

    function forcedTransfer(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function mint(address to, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function recoveryAddress(
        address lostWallet,
        address newWallet,
        address investorOnchainID
    ) external returns (bool);

    function batchTransfer(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external;

    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external;

    function batchMint(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external;

    function batchBurn(
        address[] calldata fromList,
        uint256[] calldata amounts
    ) external;

    function batchSetAddressFrozen(
        address[] calldata addrList,
        bool[] calldata freezeList
    ) external;

    function batchFreezePartialTokens(
        address[] calldata addrList,
        uint256[] calldata amounts
    ) external;

    function batchUnfreezePartialTokens(
        address[] calldata addrList,
        uint256[] calldata amounts
    ) external;

    // View Functions
    function identityRegistry() external view returns (IIdentityRegistry);

    function compliance() external view returns (ICompliance);

    function paused() external view returns (bool);

    function isFrozen(address addr) external view returns (bool);

    function getFrozenTokens(address addr) external view returns (uint256);
}
