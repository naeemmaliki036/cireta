// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DividendDistributor
/// @notice Pull-based dividend distribution for ERC-3643 token holders.
/// @dev Issuer deposits USDC. Snapshot of total supply taken at deposit time.
///      Each holder can claim their proportional share at any time.
contract DividendDistributor is ReentrancyGuard, Ownable {
    IERC20 public immutable token;
    IERC20 public immutable usdc;

    struct Epoch {
        uint256 totalAmount;
        uint256 totalSupplySnapshot;
        uint256 timestamp;
    }

    uint256 public epochCount;
    mapping(uint256 => Epoch) public epochs;

    // epochIndex => holder => claimed
    mapping(uint256 => mapping(address => bool)) public epochClaimed;

    // holder => total USDC claimed across all epochs
    mapping(address => uint256) public totalClaimedByHolder;

    uint256 public totalDistributedAmount;

    event DividendDeposited(uint256 indexed epoch, uint256 amount, uint256 totalSupplySnapshot);
    event DividendClaimed(address indexed holder, uint256 indexed epoch, uint256 amount);

    error ZeroAmount();
    error AlreadyClaimed();
    error NothingToClaim();

    constructor(address _token, address _usdc, address _owner) Ownable(_owner) {
        token = IERC20(_token);
        usdc = IERC20(_usdc);
    }

    /// @notice Issuer deposits USDC to create a new distribution epoch.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 supply = token.totalSupply();
        require(supply > 0, "No token holders");

        usdc.transferFrom(msg.sender, address(this), amount);

        uint256 epochIndex = epochCount;
        epochs[epochIndex] = Epoch({
            totalAmount: amount,
            totalSupplySnapshot: supply,
            timestamp: block.timestamp
        });
        epochCount++;
        totalDistributedAmount += amount;

        emit DividendDeposited(epochIndex, amount, supply);
    }

    /// @notice Holder claims all unclaimed dividends across all epochs.
    function claim() external nonReentrant {
        uint256 totalOwed = 0;
        for (uint256 i = 0; i < epochCount; i++) {
            if (!epochClaimed[i][msg.sender]) {
                uint256 holderBalance = token.balanceOf(msg.sender);
                if (holderBalance > 0) {
                    Epoch storage e = epochs[i];
                    uint256 share = (holderBalance * e.totalAmount) / e.totalSupplySnapshot;
                    if (share > 0) {
                        epochClaimed[i][msg.sender] = true;
                        totalOwed += share;
                    }
                }
            }
        }
        if (totalOwed == 0) revert NothingToClaim();
        totalClaimedByHolder[msg.sender] += totalOwed;
        usdc.transfer(msg.sender, totalOwed);
        emit DividendClaimed(msg.sender, epochCount - 1, totalOwed);
    }

    /// @notice Returns total claimable USDC for a holder across all epochs.
    function claimable(address holder) external view returns (uint256 total) {
        for (uint256 i = 0; i < epochCount; i++) {
            if (!epochClaimed[i][holder]) {
                uint256 bal = token.balanceOf(holder);
                if (bal > 0) {
                    Epoch storage e = epochs[i];
                    total += (bal * e.totalAmount) / e.totalSupplySnapshot;
                }
            }
        }
    }

    /// @notice Total USDC deposited across all epochs.
    function totalDistributed() external view returns (uint256) {
        return totalDistributedAmount;
    }

    /// @notice Total USDC claimed by a holder across all epochs.
    function totalClaimed(address holder) external view returns (uint256) {
        return totalClaimedByHolder[holder];
    }

    /// @notice Epoch details.
    function getEpoch(uint256 epochIndex) external view returns (Epoch memory) {
        return epochs[epochIndex];
    }
}
