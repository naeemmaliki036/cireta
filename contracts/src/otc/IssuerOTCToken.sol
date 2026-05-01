// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IIdentityRegistry.sol";

/// @title IssuerOTCToken
/// @notice Per-issuer ERC-20 OTC token used as payment in Sale.buyOTC().
///         Issuers mint these to investors who paid off-platform; the Sale contract
///         burns them on purchase, converting them into project tokens.
///         Transfers between wallets require identity verification.
contract IssuerOTCToken is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    IIdentityRegistry public identityRegistry;
    address public issuerWallet;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[100] private __gap;

    // --- Events ---
    event OTCMinted(address indexed to, uint256 amount);
    event OTCBurned(address indexed from, uint256 amount);
    /// @notice Emitted on every UUPS upgrade. ERC1967 also emits `Upgraded(impl)`
    /// from the proxy; this is a parallel marker that includes the nonce when
    /// available, so off-chain monitors can sequence upgrade-related events.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

    // --- Errors ---
    error RecipientNotVerified(address to);
    error ZeroAddress();
    error ZeroAmount();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the OTC token proxy.
    /// @param name      Token name (e.g. "Cireta OTC - Acme Gold")
    /// @param symbol    Token symbol (e.g. "cOTC-ACME")
    /// @param _issuerWallet  Issuer wallet that receives MINTER_ROLE
    /// @param _identityRegistry  Identity registry for transfer gating
    function initialize(
        string memory name,
        string memory symbol,
        address _issuerWallet,
        address _identityRegistry
    ) public initializer {
        if (_issuerWallet == address(0)) revert ZeroAddress();
        if (_identityRegistry == address(0)) revert ZeroAddress();

        __ERC20_init(name, symbol);

        identityRegistry = IIdentityRegistry(_identityRegistry);
        issuerWallet = _issuerWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, _issuerWallet);
        _grantRole(MINTER_ROLE, _issuerWallet);
    }

    /// @notice 6 decimals to match USDC
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint OTC tokens to an investor. Only callable by MINTER_ROLE (issuer).
    /// @param to      Recipient address
    /// @param amount  Amount to mint (6 decimals)
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
        emit OTCMinted(to, amount);
    }

    /// @notice Burn OTC tokens from an address. Public — Sale contract calls this
    ///         to consume OTC tokens during buyOTC().
    /// @param from    Address to burn from (must have approved this caller)
    /// @param amount  Amount to burn
    function burn(address from, uint256 amount) external {
        if (from != msg.sender) {
            _spendAllowance(from, msg.sender, amount);
        }
        _burn(from, amount);
        emit OTCBurned(from, amount);
    }

    /// @notice Transfer gating — only identity-verified wallets can receive tokens.
    ///         Mint (from == address(0)) and burn (to == address(0)) are always allowed.
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Allow minting and burning without identity check
        if (from != address(0) && to != address(0)) {
            if (!identityRegistry.isVerified(to)) revert RecipientNotVerified(to);
        }
        super._update(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        upgradeNonce++;
        emit ImplementationUpgraded(newImplementation, upgradeNonce);
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "5.0.0"; }
}
