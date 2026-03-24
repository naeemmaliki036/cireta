// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title IssuerRegistry
 * @dev Registry of approved issuers on the platform
 */
contract IssuerRegistry is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    enum IssuerStatus {
        None,
        Pending,
        Active,
        Suspended
    }

    struct Issuer {
        address wallet;
        string name;
        string jurisdiction;
        IssuerStatus status;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    // Mapping issuer wallet => issuer data
    mapping(address => Issuer) public issuers;

    // Array of all issuer addresses
    address[] private _issuerAddresses;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // Events
    event IssuerRegistered(address indexed wallet, string name, string jurisdiction);
    event IssuerActivated(address indexed wallet);
    event IssuerSuspended(address indexed wallet, string reason);
    event IssuerUpdated(address indexed wallet, string name, string jurisdiction);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    modifier onlyActiveIssuer() {
        require(issuers[msg.sender].status == IssuerStatus.Active, "not active issuer");
        _;
    }

    function registerIssuer(
        address wallet,
        string calldata name,
        string calldata jurisdiction
    ) external onlyOwner {
        require(wallet != address(0), "zero address");
        require(bytes(name).length > 0, "empty name");
        require(issuers[wallet].status == IssuerStatus.None, "already registered");

        issuers[wallet] = Issuer({
            wallet: wallet,
            name: name,
            jurisdiction: jurisdiction,
            status: IssuerStatus.Pending,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });

        _issuerAddresses.push(wallet);

        emit IssuerRegistered(wallet, name, jurisdiction);
    }

    function activateIssuer(address wallet) external onlyOwner {
        require(issuers[wallet].status == IssuerStatus.Pending, "not pending");

        issuers[wallet].status = IssuerStatus.Active;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerActivated(wallet);
    }

    function suspendIssuer(
        address wallet,
        string calldata reason
    ) external onlyOwner {
        require(
            issuers[wallet].status == IssuerStatus.Active ||
            issuers[wallet].status == IssuerStatus.Pending,
            "invalid status"
        );

        issuers[wallet].status = IssuerStatus.Suspended;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerSuspended(wallet, reason);
    }

    function reactivateIssuer(address wallet) external onlyOwner {
        require(issuers[wallet].status == IssuerStatus.Suspended, "not suspended");

        issuers[wallet].status = IssuerStatus.Active;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerActivated(wallet);
    }

    function updateIssuer(
        address wallet,
        string calldata name,
        string calldata jurisdiction
    ) external onlyOwner {
        require(issuers[wallet].status != IssuerStatus.None, "not registered");
        require(bytes(name).length > 0, "empty name");

        issuers[wallet].name = name;
        issuers[wallet].jurisdiction = jurisdiction;
        issuers[wallet].updatedAt = block.timestamp;

        emit IssuerUpdated(wallet, name, jurisdiction);
    }

    function isActiveIssuer(address wallet) external view returns (bool) {
        return issuers[wallet].status == IssuerStatus.Active;
    }

    function getIssuer(address wallet) external view returns (Issuer memory) {
        return issuers[wallet];
    }

    function getAllIssuers() external view returns (address[] memory) {
        return _issuerAddresses;
    }

    function getActiveIssuers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _issuerAddresses.length; i++) {
            if (issuers[_issuerAddresses[i]].status == IssuerStatus.Active) {
                count++;
            }
        }

        address[] memory active = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _issuerAddresses.length; i++) {
            if (issuers[_issuerAddresses[i]].status == IssuerStatus.Active) {
                active[index] = _issuerAddresses[i];
                index++;
            }
        }

        return active;
    }
}
