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

    // Flag to bypass _update validation during forced operations (transfer/recovery)
    bool private _forcedOperation;

    // Custom name/symbol overrides (ERC20Upgradeable doesn't support post-init changes)
    string private _nameOverride;
    string private _symbolOverride;

    // ---- NEW STORAGE (appended at end to preserve upgrade safety) ----

    /// @dev Hard cap on total supply. Must be > 0. Enforced on every mint.
    uint256 private _maxSupply;

    /// @dev When false, SUPPLY_ROLE was revoked at initialize time (fixed supply).
    ///      When true, authorized minters can mint up to _maxSupply.
    bool private _mintable;

    /// @dev Reserved storage gap — reduced by 2 to account for _maxSupply + _mintable above.
    uint256[48] private __gap;

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
    event ForceTransferSuccess(
        address indexed from,
        address indexed to,
        uint256 amount,
        string reason
    );
    event AddressFrozen(address indexed addr, bool indexed isFrozen, address indexed agent);
    event TokensFrozen(address indexed addr, uint256 amount);
    event TokensUnfrozen(address indexed addr, uint256 amount);
    /// @notice Emitted on every mint/batchMint entry. ERC20 `Transfer(0,...)` is
    /// also emitted by `_mint` but consumers (subgraphs, workers) often need a
    /// dedicated mint event to filter without inspecting the `from` field.
    event TokensMinted(address indexed to, uint256 amount, address indexed minter);
    /// @notice Emitted on every burn/batchBurn entry — paired with ERC20 `Transfer(...,0,...)`.
    event TokensBurned(address indexed from, uint256 amount, address indexed burner);
    /// @notice Emitted on every UUPS upgrade. ERC1967 also emits `Upgraded(impl)`
    /// from the proxy; this is a parallel marker that includes the nonce when
    /// available, so off-chain monitors can sequence upgrade-related events.
    event ImplementationUpgraded(address indexed newImplementation, uint256 nonce);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token.
     * @param name_               ERC-20 name
     * @param symbol_             ERC-20 symbol
     * @param decimals_           Decimals (max 6)
     * @param identityRegistry_   Identity registry contract address
     * @param compliance_         Compliance contract address
     * @param owner_              Issuer — receives all roles and initial mint
     * @param admin_              Platform admin — gets oversight roles, NOT SUPPLY_ROLE
     * @param maxSupply_          Hard cap on total supply; must be > 0
     * @param mintable_           If false, SUPPLY_ROLE is revoked after the initial mint
     * @param initialMintAmount_  Tokens to pre-mint to owner_. For fixed supply must equal maxSupply_.
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address identityRegistry_,
        address compliance_,
        address owner_,
        address admin_,
        uint256 maxSupply_,
        bool mintable_,
        uint256 initialMintAmount_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();

        require(decimals_ <= 6, "CiretaToken: max 6 decimals");
        _decimals = decimals_;
        _identityRegistry = IIdentityRegistry(identityRegistry_);
        _compliance = ICompliance(compliance_);

        // Issuer (owner_) gets all roles
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(AGENT_ROLE, owner_);
        _grantRole(SUPPLY_ROLE, owner_);
        _grantRole(FREEZE_ROLE, owner_);
        _grantRole(RECOVERY_ROLE, owner_);

        // Platform admin gets oversight roles (NOT SUPPLY_ROLE —
        // admin must never mint/burn an issuer's security tokens)
        if (admin_ != address(0) && admin_ != owner_) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin_);
            _grantRole(AGENT_ROLE, admin_);
            _grantRole(FREEZE_ROLE, admin_);
            _grantRole(RECOVERY_ROLE, admin_);
        }

        // ---- Supply economics ----
        require(maxSupply_ > 0, "max supply required");
        if (!mintable_) {
            require(initialMintAmount_ == maxSupply_, "fixed supply must mint full max");
        } else {
            require(initialMintAmount_ <= maxSupply_, "initial > max");
        }
        _maxSupply = maxSupply_;
        _mintable = mintable_;

        // Pre-mint to owner if requested.
        // NOTE: _compliance.created() is NOT called here because bindToken() has not
        // happened yet — the factory calls bindToken() AFTER initialize() returns.
        // The initial allocation is an issuer-side action; compliance modules catch
        // up with holder state on the next mint/transfer.
        if (initialMintAmount_ > 0) {
            _mint(owner_, initialMintAmount_);
        }

        // For fixed-supply tokens: revoke SUPPLY_ROLE from the issuer so minting
        // is permanently locked. Admin never had SUPPLY_ROLE, so nothing to revoke there.
        if (!mintable_) {
            _revokeRole(SUPPLY_ROLE, owner_);
        }
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit ImplementationUpgraded(newImplementation, 0);
    }

    // ============ Supply Getters ============

    /// @notice Hard cap on total supply set at initialization.
    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    /// @notice Returns true if additional minting (beyond initial) is permitted.
    function isMintable() external view returns (bool) {
        return _mintable;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function name() public view virtual override returns (string memory) {
        return bytes(_nameOverride).length > 0 ? _nameOverride : super.name();
    }

    function symbol() public view virtual override returns (string memory) {
        return bytes(_symbolOverride).length > 0 ? _symbolOverride : super.symbol();
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
        _nameOverride = newName;
        emit UpdatedTokenInformation(newName, symbol(), _decimals, "1.0", _onchainID);
    }

    function setSymbol(string calldata newSymbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _symbolOverride = newSymbol;
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

    /// @notice Mint tokens to a single address. Enforces maxSupply cap.
    ///         SUPPLY_ROLE is already trusted — no identity check on the recipient
    ///         (minting to issuer-controlled addresses is normal; compliance.created
    ///         handles module-level tracking).
    function mint(address to, uint256 amount) external onlyRole(SUPPLY_ROLE) {
        require(totalSupply() + amount <= _maxSupply, "exceeds max supply");
        _mint(to, amount);
        _compliance.created(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    function burn(address account, uint256 amount) external onlyRole(SUPPLY_ROLE) {
        _burn(account, amount);
        _compliance.destroyed(account, amount);
        emit TokensBurned(account, amount, msg.sender);
    }

    function batchMint(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external onlyRole(SUPPLY_ROLE) {
        require(toList.length == amounts.length, "length mismatch");
        uint256 currentSupply = totalSupply();
        for (uint256 i = 0; i < toList.length; i++) {
            require(currentSupply + amounts[i] <= _maxSupply, "exceeds max supply");
            require(_identityRegistry.isVerified(toList[i]), "identity not verified");
            _mint(toList[i], amounts[i]);
            _compliance.created(toList[i], amounts[i]);
            emit TokensMinted(toList[i], amounts[i], msg.sender);
            currentSupply += amounts[i];
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
            emit TokensBurned(fromList[i], amounts[i], msg.sender);
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

        // Bypass _update validation (frozen checks, compliance canTransfer)
        // but still notify compliance modules via transferred() for holder tracking
        _forcedOperation = true;
        _transfer(from, to, amount);
        _forcedOperation = false;
        // Emit a dedicated event so consumers can distinguish a regulatory
        // forced transfer from a voluntary ERC20 transfer using only logs.
        emit ForceTransferSuccess(from, to, amount, "agent forced transfer");
        return true;
    }

    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external onlyRole(AGENT_ROLE) {
        require(fromList.length == toList.length, "length mismatch");
        require(fromList.length == amounts.length, "length mismatch");

        _forcedOperation = true;
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
            emit ForceTransferSuccess(fromList[i], toList[i], amounts[i], "agent batch forced transfer");
        }
        _forcedOperation = false;
    }

    // ============ Recovery ============

    /// @notice Same-user wallet swap recovery. Moves full balance + frozen state
    /// from lostWallet to newWallet. In simple-whitelist mode (no ONCHAINID),
    /// pass investorOnchainID = address(0) to skip the identity check.
    function recoveryAddress(
        address lostWallet,
        address newWallet,
        address investorOnchainID
    ) external onlyRole(RECOVERY_ROLE) returns (bool) {
        require(_identityRegistry.isVerified(newWallet), "new wallet not verified");
        // In simple-whitelist mode identity() returns address(0) — skip check.
        if (investorOnchainID != address(0)) {
            require(
                address(_identityRegistry.identity(lostWallet)) == investorOnchainID,
                "identity mismatch"
            );
        }

        uint256 balance = balanceOf(lostWallet);
        if (balance > 0) {
            _forcedOperation = true;
            _transfer(lostWallet, newWallet, balance);
            _forcedOperation = false;
        }

        if (_frozenTokens[lostWallet] > 0) {
            _frozenTokens[newWallet] = _frozenTokens[lostWallet];
            delete _frozenTokens[lostWallet];
        }

        if (_frozen[lostWallet]) {
            _frozen[newWallet] = true;
            delete _frozen[lostWallet];
        }

        emit RecoverySuccess(lostWallet, newWallet, investorOnchainID);
        return true;
    }

    /// @notice Cross-user force transfer. Moves a specified amount from one wallet
    /// to another — wallets can belong to different users. Used for inheritance,
    /// court orders, compliance seizure. Does NOT copy frozen state.
    function forceTransfer(
        address from,
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(RECOVERY_ROLE) {
        require(to != address(0), "zero address");
        require(amount > 0, "zero amount");
        require(_identityRegistry.isVerified(to), "recipient not verified");

        _forcedOperation = true;
        _transfer(from, to, amount);
        _forcedOperation = false;

        emit ForceTransferSuccess(from, to, amount, reason);
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
        // Skip validation for mint/burn and forced operations (forcedTransfer, recovery)
        if (from != address(0) && to != address(0) && !_forcedOperation) {
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

        // Always notify compliance of transfers (including forced) for holder tracking
        if (from != address(0) && to != address(0)) {
            _compliance.transferred(from, to, value);
        }
    }
}
