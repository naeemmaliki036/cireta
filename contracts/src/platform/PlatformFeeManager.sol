// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PlatformFeeManager
 * @dev Manages platform fees for Cireta
 */
contract PlatformFeeManager is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // Platform fee receiver
    address public feeReceiver;

    // Default platform fee in basis points (200 = 2%)
    uint256 public defaultFeeBps;

    // Issuer-specific fee overrides (issuer => fee bps)
    mapping(address => uint256) public issuerFeeBps;

    // Whether issuer has custom fee
    mapping(address => bool) public hasCustomFee;

    // Maximum fee (10%)
    uint256 public constant MAX_FEE_BPS = 1000;

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // Events
    event FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event DefaultFeeUpdated(uint256 oldFee, uint256 newFee);
    event IssuerFeeUpdated(address indexed issuer, uint256 feeBps);
    event FeeCollected(
        address indexed sale,
        address indexed issuer,
        address indexed token,
        uint256 amount,
        uint256 feeBps
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address _feeReceiver,
        uint256 _defaultFeeBps
    ) public initializer {
        require(_feeReceiver != address(0), "zero fee receiver");
        require(_defaultFeeBps <= MAX_FEE_BPS, "fee too high");

        __Ownable_init(initialOwner);

        feeReceiver = _feeReceiver;
        defaultFeeBps = _defaultFeeBps;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "zero address");

        address oldReceiver = feeReceiver;
        feeReceiver = newReceiver;

        emit FeeReceiverUpdated(oldReceiver, newReceiver);
    }

    function setDefaultFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "fee too high");

        uint256 oldFee = defaultFeeBps;
        defaultFeeBps = newFeeBps;

        emit DefaultFeeUpdated(oldFee, newFeeBps);
    }

    function setIssuerFee(address issuer, uint256 feeBps) external onlyOwner {
        require(feeBps <= MAX_FEE_BPS, "fee too high");

        issuerFeeBps[issuer] = feeBps;
        hasCustomFee[issuer] = true;

        emit IssuerFeeUpdated(issuer, feeBps);
    }

    function removeIssuerCustomFee(address issuer) external onlyOwner {
        delete issuerFeeBps[issuer];
        delete hasCustomFee[issuer];

        emit IssuerFeeUpdated(issuer, defaultFeeBps);
    }

    function getFeeForIssuer(address issuer) external view returns (uint256) {
        if (hasCustomFee[issuer]) {
            return issuerFeeBps[issuer];
        }
        return defaultFeeBps;
    }

    function calculateFee(
        address issuer,
        uint256 amount
    ) external view returns (uint256) {
        uint256 feeBps = hasCustomFee[issuer] ? issuerFeeBps[issuer] : defaultFeeBps;
        return (amount * feeBps) / 10000;
    }

    function collectFee(
        address issuer,
        address token,
        uint256 amount
    ) external returns (uint256 feeAmount) {
        uint256 feeBps = hasCustomFee[issuer] ? issuerFeeBps[issuer] : defaultFeeBps;
        feeAmount = (amount * feeBps) / 10000;

        if (feeAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, feeReceiver, feeAmount);

            emit FeeCollected(msg.sender, issuer, token, feeAmount, feeBps);
        }

        return feeAmount;
    }
}
