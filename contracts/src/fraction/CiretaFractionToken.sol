// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

/// @title CiretaFractionToken
/// @notice Lightweight gated ERC-20 receipt token representing a claim on an ERC-3643
///         project token locked in CiretaVault. Minted on contribution, burned on claim.
///         Uses the shared IdentityRegistry for KYC gating (lighter than full ERC-3643).
contract CiretaFractionToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    IIdentityRegistry public identityRegistry;
    address public projectToken;
    address public vault;
    uint8 private _decimals;

    // --- Events ---
    event FractionsMinted(address indexed to, uint256 amount);
    event FractionsBurned(address indexed from, uint256 amount);

    // --- Errors ---
    error RecipientNotVerified(address to);
    error SenderNotVerified(address from);
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        address _identityRegistry,
        address _projectToken,
        address _vault,
        address admin
    ) public initializer {
        __ERC20_init(name, symbol);
        // Note: __ERC20Burnable_init(), __AccessControl_init(), __UUPSUpgradeable_init()
        // removed in OZ 5.x — no initializer state needed.

        if (_identityRegistry == address(0) || _projectToken == address(0)) revert ZeroAddress();

        identityRegistry = IIdentityRegistry(_identityRegistry);
        projectToken = _projectToken;
        vault = _vault;
        _decimals = decimals_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint fractions to investor — called by Sale contract on contribute()
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        emit FractionsMinted(to, amount);
    }

    /// @notice Burn fractions from investor — called by Vault on claim()
    function burnFrom(address from, uint256 amount) public override onlyRole(BURNER_ROLE) {
        _burn(from, amount);
        emit FractionsBurned(from, amount);
    }

    /// @notice Transfer gating — only KYC-verified wallets can send/receive
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            if (!identityRegistry.isVerified(from)) revert SenderNotVerified(from);
            if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        }
        super._update(from, to, value);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
