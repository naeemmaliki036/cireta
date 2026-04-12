// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../fraction/CiretaFractionToken1155.sol";
import "../vault/CiretaVault.sol";

/// @title CiretaFractionFactory
/// @notice Deploys CiretaFractionToken + CiretaVault pairs for vested sales.
///         Grants MINTER_ROLE to Sale, BURNER_ROLE to Vault on the fraction token.
contract CiretaFractionFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    address public fractionTokenImplementation;
    address public vaultImplementation;

    address[] public deployedVaults;
    mapping(address => address) public saleToVault;
    mapping(address => address) public saleToFraction;

    /// @notice Incremented on every UUPS upgrade.
    uint256 public upgradeNonce;

    /// @dev Reserved storage gap for future upgrades
    uint256[100] private __gap;

    event VaultDeployed(address indexed sale, address vault, address fractionToken, address projectToken);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _owner,
        address _fractionImpl,
        address _vaultImpl
    ) public initializer {
        __Ownable_init(_owner);

        fractionTokenImplementation = _fractionImpl;
        vaultImplementation = _vaultImpl;
    }

    /// @notice Deploy a fraction token + vault pair for a vested sale (round 5).
    /// Uses the new ERC-1155 fraction token with id 1 (USDC) and id 2 (OTC).
    function deployVaultAndFraction(
        string memory fractionName,
        string memory fractionSymbol,
        uint8, // decimals ignored — always 6 (matches project token)
        address projectToken,
        address identityRegistry,
        address sale,
        uint256 cliffDuration,
        uint256 vestingDuration,
        CiretaVault.ExcessPolicy excessPolicy,
        address admin
    ) external onlyOwner returns (address fractionProxy, address vaultProxy) {
        // Deploy Vault proxy with factory as owner (to allow setFractionToken)
        bytes memory vaultInitData = abi.encodeCall(
            CiretaVault.initialize,
            (
                projectToken,
                address(0),           // fractionToken — set in two-step deploy below
                identityRegistry,
                cliffDuration,
                vestingDuration,
                sale,
                admin,
                excessPolicy,
                address(this)         // owner = factory (transferred to admin at end)
            )
        );
        vaultProxy = address(new ERC1967Proxy(vaultImplementation, vaultInitData));

        // Deploy ERC-1155 FractionToken proxy with factory as admin
        bytes memory fractionInitData = abi.encodeCall(
            CiretaFractionToken1155.initialize,
            (fractionName, fractionSymbol, 6, identityRegistry, projectToken, vaultProxy, address(this))
        );
        fractionProxy = address(new ERC1967Proxy(fractionTokenImplementation, fractionInitData));

        // Set fraction token on vault (two-step deploy)
        CiretaVault(vaultProxy).setFractionToken(fractionProxy);

        // Grant roles: Sale can mint, Vault + Sale can burn
        bytes32 minterRole = CiretaFractionToken1155(fractionProxy).MINTER_ROLE();
        bytes32 burnerRole = CiretaFractionToken1155(fractionProxy).BURNER_ROLE();
        bytes32 defaultAdmin = CiretaFractionToken1155(fractionProxy).DEFAULT_ADMIN_ROLE();

        CiretaFractionToken1155(fractionProxy).grantRole(minterRole, sale);
        CiretaFractionToken1155(fractionProxy).grantRole(burnerRole, vaultProxy);
        CiretaFractionToken1155(fractionProxy).grantRole(burnerRole, sale);

        // Grant recovery role to admin (issuer signer) for force-transfers
        bytes32 recoveryRole = CiretaFractionToken1155(fractionProxy).RECOVERY_ROLE();
        CiretaFractionToken1155(fractionProxy).grantRole(recoveryRole, admin);

        // Transfer fraction token admin
        CiretaFractionToken1155(fractionProxy).grantRole(defaultAdmin, admin);
        CiretaFractionToken1155(fractionProxy).renounceRole(defaultAdmin, address(this));

        // Transfer vault ownership to the actual admin
        CiretaVault(vaultProxy).transferOwnership(admin);

        // Track mappings
        saleToVault[sale] = vaultProxy;
        saleToFraction[sale] = fractionProxy;
        deployedVaults.push(vaultProxy);

        emit VaultDeployed(sale, vaultProxy, fractionProxy, projectToken);
    }

    function getDeployedVaultsCount() external view returns (uint256) {
        return deployedVaults.length;
    }

    function setFractionTokenImplementation(address impl) external onlyOwner {
        require(impl != address(0), "zero impl");
        fractionTokenImplementation = impl;
    }

    function setVaultImplementation(address impl) external onlyOwner {
        require(impl != address(0), "zero impl");
        vaultImplementation = impl;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {
        upgradeNonce++;
    }

    /// @notice Contract version.
    function version() external pure returns (string memory) { return "5.0.0"; }
}
