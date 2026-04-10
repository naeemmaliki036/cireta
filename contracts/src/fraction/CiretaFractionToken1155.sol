// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

/// @title CiretaFractionToken1155
/// @notice Round-5 ERC-1155 fraction token. Two ids:
///         - id 1 (FRACTION_ID_USDC): minted on Sale.buy() — refund-eligible
///         - id 2 (FRACTION_ID_OTC):  minted on Sale.buyOTC() — NOT refund-eligible
///         Soul-bound by design: peer transfers are blocked. Only mint and burn
///         are allowed. This locks the vesting position to the original buyer
///         (closes the "fractions are practically non-transferable" blind spot
///         from SALE_SYSTEM_DEEP_DIVE.md §B3 by making it explicit).
///
///         The two ids share the same vesting schedule (set in CiretaVault) but
///         are tracked separately so the refund flow can burn id-1 only.
contract CiretaFractionToken1155 is
    Initializable,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @notice Token ids — keep in sync with Sale.FRACTION_ID_USDC / FRACTION_ID_OTC.
    uint256 public constant ID_USDC = 1;
    uint256 public constant ID_OTC  = 2;

    IIdentityRegistry public identityRegistry;
    address public projectToken;
    address public vault;
    uint8 public tokenDecimals;     // Snapshot from project token, used by UI

    string public name;
    string public symbol;

    /// @dev Reserved storage gap for future upgrades
    uint256[48] private __gap;

    // --- Events ---
    event FractionsMinted(address indexed to, uint256 indexed id, uint256 amount);
    event FractionsBurned(address indexed from, uint256 indexed id, uint256 amount);

    // --- Errors ---
    error ZeroAddress();
    error ZeroAmount();
    error InvalidId();
    error NonTransferable();
    error RecipientNotVerified(address to);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _identityRegistry,
        address _projectToken,
        address _vault,
        address admin
    ) public initializer {
        __ERC1155_init("");

        if (_identityRegistry == address(0) || _projectToken == address(0)) revert ZeroAddress();

        name = _name;
        symbol = _symbol;
        tokenDecimals = _decimals;
        identityRegistry = IIdentityRegistry(_identityRegistry);
        projectToken = _projectToken;
        vault = _vault;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Mint fractions of a specific id to an investor. Sale-only.
    function mint(address to, uint256 id, uint256 amount, bytes memory data)
        external
        onlyRole(MINTER_ROLE)
    {
        if (id != ID_USDC && id != ID_OTC) revert InvalidId();
        if (amount == 0) revert ZeroAmount();
        // Recipient must be KYC-verified (mint is the only check; transfers are blocked)
        if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        _mint(to, id, amount, data);
        emit FractionsMinted(to, id, amount);
    }

    /// @notice Burn fractions of a specific id from an address. Vault/Sale only.
    function burn(address from, uint256 id, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
    {
        if (id != ID_USDC && id != ID_OTC) revert InvalidId();
        if (amount == 0) revert ZeroAmount();
        _burn(from, id, amount);
        emit FractionsBurned(from, id, amount);
    }

    /// @notice Transfer gating — fractions are SOUL-BOUND (round 5 design).
    /// Only mint (from == 0) and burn (to == 0) are allowed.
    /// Closes blind spot B3: previously fractions were transferable in the
    /// ERC-20 contract but the vault tracked allocations against the original
    /// buyer, making transfers a footgun.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert NonTransferable();
        }
        super._update(from, to, ids, values);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Required for AccessControl + ERC1155 — explicit override for the diamond inheritance.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
