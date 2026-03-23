// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IToken.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/ICompliance.sol";

/**
 * @title CiretaToken
 * @dev ERC-3643 compliant security token for Cireta platform
 */
contract CiretaToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant SUPPLY_ROLE = keccak256("SUPPLY_ROLE");
    bytes32 public constant FREEZE_ROLE = keccak256("FREEZE_ROLE");
    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");

    // Identity registry for investor verification
    IIdentityRegistry private _identityRegistry;

    // Compliance contract for transfer rules
    ICompliance private _compliance;

    // Token decimals
    uint8 private _decimals;

    // Token onchain ID
    address private _onchainID;

    // Frozen addresses
    mapping(address => bool) private _frozen;

    // Partially frozen tokens per address
    mapping(address => uint256) private _frozenTokens;

    // Events from IToken
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address identityRegistry_,
        address compliance_,
        address owner_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();

        _decimals = decimals_;
        _identityRegistry = IIdentityRegistry(identityRegistry_);
        _compliance = ICompliance(compliance_);

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(AGENT_ROLE, owner_);
        _grantRole(SUPPLY_ROLE, owner_);
        _grantRole(FREEZE_ROLE, owner_);
        _grantRole(RECOVERY_ROLE, owner_);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    // ============ Identity & Compliance ============

    function setIdentityRegistry(
        address identityRegistry_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(identityRegistry_ != address(0), "zero address");
        _identityRegistry = IIdentityRegistry(identityRegistry_);
        emit IdentityRegistryAdded(identityRegistry_);
    }

    function setCompliance(
        address compliance_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(compliance_ != address(0), "zero address");
        _compliance = ICompliance(compliance_);
        emit ComplianceAdded(compliance_);
    }

    function identityRegistry() external view returns (IIdentityRegistry) {
        return _identityRegistry;
    }

    function compliance() external view returns (ICompliance) {
        return _compliance;
    }

    // ============ Token Info ============

    function setName(string calldata newName) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Note: ERC20Upgradeable doesn't allow name change after init
        // This would require custom storage
        emit UpdatedTokenInformation(newName, symbol(), _decimals, "1.0", _onchainID);
    }

    function setSymbol(string calldata newSymbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit UpdatedTokenInformation(name(), newSymbol, _decimals, "1.0", _onchainID);
    }

    function setOnchainID(address onchainID_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _onchainID = onchainID_;
        emit UpdatedTokenInformation(name(), symbol(), _decimals, "1.0", onchainID_);
    }

    // ============ Pause/Unpause ============

    function pause() external onlyRole(AGENT_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(AGENT_ROLE) {
        _unpause();
    }

    // ============ Freeze ============

    function setAddressFrozen(
        address addr,
        bool freeze
    ) external onlyRole(FREEZE_ROLE) {
        require(addr != address(0), "zero address");
        _frozen[addr] = freeze;
        emit AddressFrozen(addr, freeze, msg.sender);
    }

    function freezePartialTokens(
        address addr,
        uint256 amount
    ) external onlyRole(FREEZE_ROLE) {
        require(amount <= balanceOf(addr) - _frozenTokens[addr], "not enough tokens");
        _frozenTokens[addr] += amount;
        emit TokensFrozen(addr, amount);
    }

    function unfreezePartialTokens(
        address addr,
        uint256 amount
    ) external onlyRole(FREEZE_ROLE) {
        require(amount <= _frozenTokens[addr], "not enough frozen");
        _frozenTokens[addr] -= amount;
        emit TokensUnfrozen(addr, amount);
    }

    function isFrozen(address addr) external view returns (bool) {
        return _frozen[addr];
    }

    function getFrozenTokens(address addr) external view returns (uint256) {
        return _frozenTokens[addr];
    }

    // ============ Batch Freeze ============

    function batchSetAddressFrozen(
        address[] calldata addrList,
        bool[] calldata freezeList
    ) external onlyRole(FREEZE_ROLE) {
        require(addrList.length == freezeList.length, "length mismatch");
        for (uint256 i = 0; i < addrList.length; i++) {
            _frozen[addrList[i]] = freezeList[i];
            emit AddressFrozen(addrList[i], freezeList[i], msg.sender);
        }
    }

    function batchFreezePartialTokens(
        address[] calldata addrList,
        uint256[] calldata amounts
    ) external onlyRole(FREEZE_ROLE) {
        require(addrList.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < addrList.length; i++) {
            require(
                amounts[i] <= balanceOf(addrList[i]) - _frozenTokens[addrList[i]],
                "not enough tokens"
            );
            _frozenTokens[addrList[i]] += amounts[i];
            emit TokensFrozen(addrList[i], amounts[i]);
        }
    }

    function batchUnfreezePartialTokens(
        address[] calldata addrList,
        uint256[] calldata amounts
    ) external onlyRole(FREEZE_ROLE) {
        require(addrList.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < addrList.length; i++) {
            require(amounts[i] <= _frozenTokens[addrList[i]], "not enough frozen");
            _frozenTokens[addrList[i]] -= amounts[i];
            emit TokensUnfrozen(addrList[i], amounts[i]);
        }
    }

    // ============ Mint/Burn ============

    function mint(address to, uint256 amount) external onlyRole(SUPPLY_ROLE) {
        require(_identityRegistry.isVerified(to), "identity not verified");
        _mint(to, amount);
        _compliance.created(to, amount);
    }

    function burn(address account, uint256 amount) external onlyRole(SUPPLY_ROLE) {
        _burn(account, amount);
        _compliance.destroyed(account, amount);
    }

    function batchMint(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external onlyRole(SUPPLY_ROLE) {
        require(toList.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < toList.length; i++) {
            require(_identityRegistry.isVerified(toList[i]), "identity not verified");
            _mint(toList[i], amounts[i]);
            _compliance.created(toList[i], amounts[i]);
        }
    }

    function batchBurn(
        address[] calldata fromList,
        uint256[] calldata amounts
    ) external onlyRole(SUPPLY_ROLE) {
        require(fromList.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < fromList.length; i++) {
            _burn(fromList[i], amounts[i]);
            _compliance.destroyed(fromList[i], amounts[i]);
        }
    }

    // ============ Forced Transfer ============

    function forcedTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyRole(AGENT_ROLE) returns (bool) {
        require(_identityRegistry.isVerified(to), "to identity not verified");

        // Unfreeze tokens if needed
        if (_frozenTokens[from] > 0) {
            uint256 unfreezeAmount = amount > _frozenTokens[from]
                ? _frozenTokens[from]
                : amount;
            _frozenTokens[from] -= unfreezeAmount;
            emit TokensUnfrozen(from, unfreezeAmount);
        }

        _transfer(from, to, amount);
        // Note: _update() already calls _compliance.transferred(), so no duplicate call here.
        return true;
    }

    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external onlyRole(AGENT_ROLE) {
        require(fromList.length == toList.length, "length mismatch");
        require(fromList.length == amounts.length, "length mismatch");

        for (uint256 i = 0; i < fromList.length; i++) {
            require(_identityRegistry.isVerified(toList[i]), "to identity not verified");

            if (_frozenTokens[fromList[i]] > 0) {
                uint256 unfreezeAmount = amounts[i] > _frozenTokens[fromList[i]]
                    ? _frozenTokens[fromList[i]]
                    : amounts[i];
                _frozenTokens[fromList[i]] -= unfreezeAmount;
                emit TokensUnfrozen(fromList[i], unfreezeAmount);
            }

            _transfer(fromList[i], toList[i], amounts[i]);
            // Note: _update() already calls _compliance.transferred(), so no duplicate call here.
        }
    }

    // ============ Recovery ============

    function recoveryAddress(
        address lostWallet,
        address newWallet,
        address investorOnchainID
    ) external onlyRole(RECOVERY_ROLE) returns (bool) {
        require(_identityRegistry.isVerified(newWallet), "new wallet not verified");
        require(
            address(_identityRegistry.identity(lostWallet)) == investorOnchainID,
            "identity mismatch"
        );

        uint256 balance = balanceOf(lostWallet);
        if (balance > 0) {
            _transfer(lostWallet, newWallet, balance);
            _compliance.transferred(lostWallet, newWallet, balance);
        }

        // Transfer frozen tokens count
        if (_frozenTokens[lostWallet] > 0) {
            _frozenTokens[newWallet] = _frozenTokens[lostWallet];
            delete _frozenTokens[lostWallet];
        }

        // Transfer frozen status
        if (_frozen[lostWallet]) {
            _frozen[newWallet] = true;
            delete _frozen[lostWallet];
        }

        emit RecoverySuccess(lostWallet, newWallet, investorOnchainID);
        return true;
    }

    // ============ Batch Transfer ============

    function batchTransfer(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external {
        require(toList.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < toList.length; i++) {
            transfer(toList[i], amounts[i]);
        }
    }

    // ============ Transfer Validation ============

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // Skip checks for mint (from == 0) and burn (to == 0)
        if (from != address(0) && to != address(0)) {
            require(!_frozen[from], "sender frozen");
            require(!_frozen[to], "recipient frozen");
            require(
                balanceOf(from) - _frozenTokens[from] >= value,
                "insufficient unfrozen balance"
            );
            require(_identityRegistry.isVerified(to), "recipient not verified");
            require(_compliance.canTransfer(from, to, value), "transfer not compliant");
        }

        super._update(from, to, value);

        // Notify compliance of transfer
        if (from != address(0) && to != address(0)) {
            _compliance.transferred(from, to, value);
        }
    }
}
