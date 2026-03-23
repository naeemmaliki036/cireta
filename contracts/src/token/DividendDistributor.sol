// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DividendDistributor
/// @notice Pull-based dividend distribution for ERC-3643 token holders.
/// @dev Issuer deposits USDC. Snapshot of total supply taken at deposit time.
///      Each holder must register their balance before claiming to prevent
///      post-deposit token transfers from gaming the distribution.
contract DividendDistributor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IERC20 public immutable usdc;

    struct Epoch {
        uint256 totalAmount;
        uint256 totalSupplySnapshot;
        uint256 snapshotBlock;
        uint256 timestamp;
    }

    uint256 public epochCount;
    mapping(uint256 => Epoch) public epochs;

    // epochIndex => holder => claimed
    mapping(uint256 => mapping(address => bool)) public epochClaimed;

    // epochIndex => holder => snapshotted balance (set via snapshotBalance)
    mapping(uint256 => mapping(address => uint256)) private _holderSnapshots;

    // epochIndex => holder => whether snapshot was taken
    mapping(uint256 => mapping(address => bool)) private _holderSnapshotTaken;

    // holder => total USDC claimed across all epochs
    mapping(address => uint256) public totalClaimedByHolder;

    // holder => next epoch to claim from (gas optimization)
    mapping(address => uint256) public lastClaimedEpoch;

    uint256 public totalDistributedAmount;

    /// @notice Maximum number of epochs processed in a single claim() call.
    ///         Prevents unbounded loops from exceeding block gas limit.
    uint256 public constant MAX_CLAIM_BATCH = 100;

    event DividendDeposited(uint256 indexed epoch, uint256 amount, uint256 totalSupplySnapshot, uint256 snapshotBlock);
    event DividendClaimed(address indexed holder, uint256 indexed epoch, uint256 amount);
    event BalanceSnapshotted(address indexed holder, uint256 indexed epoch, uint256 balance);

    error ZeroAmount();
    error AlreadyClaimed();
    error NothingToClaim();
    error SnapshotAlreadyTaken();
    error NoSnapshot();

    constructor(address _token, address _usdc, address _owner) Ownable(_owner) {
        token = IERC20(_token);
        usdc = IERC20(_usdc);
    }

    /// @notice Issuer deposits USDC to create a new distribution epoch.
    function deposit(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();
        uint256 supply = token.totalSupply();
        require(supply > 0, "No token holders");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        uint256 epochIndex = epochCount;
        epochs[epochIndex] = Epoch({
            totalAmount: amount,
            totalSupplySnapshot: supply,
            snapshotBlock: block.number,
            timestamp: block.timestamp
        });
        epochCount++;
        totalDistributedAmount += amount;

        emit DividendDeposited(epochIndex, amount, supply, block.number);
    }

    /// @notice Holder snapshots their token balance for a given epoch.
    ///         Must be called before claiming. Records the holder's current balance
    ///         so that later transfers do not affect the dividend calculation.
    /// @param epochIndex The epoch to snapshot for.
    function snapshotBalance(uint256 epochIndex) external {
        require(epochIndex < epochCount, "invalid epoch");
        if (_holderSnapshotTaken[epochIndex][msg.sender]) revert SnapshotAlreadyTaken();

        uint256 balance = token.balanceOf(msg.sender);
        _holderSnapshots[epochIndex][msg.sender] = balance;
        _holderSnapshotTaken[epochIndex][msg.sender] = true;

        emit BalanceSnapshotted(msg.sender, epochIndex, balance);
    }

    /// @notice Holder claims unclaimed dividends from lastClaimedEpoch, up to MAX_CLAIM_BATCH epochs.
    ///         Requires snapshotBalance() to have been called for each epoch.
    ///         Call repeatedly if more than MAX_CLAIM_BATCH epochs are pending.
    function claim() external nonReentrant {
        uint256 start = lastClaimedEpoch[msg.sender];
        uint256 end = epochCount;
        if (end > start + MAX_CLAIM_BATCH) {
            end = start + MAX_CLAIM_BATCH;
        }
        uint256 totalOwed = _claimRange(msg.sender, start, end);
        if (totalOwed == 0) revert NothingToClaim();
        lastClaimedEpoch[msg.sender] = end;
        totalClaimedByHolder[msg.sender] += totalOwed;
        usdc.safeTransfer(msg.sender, totalOwed);
    }

    /// @notice Holder claims dividends for a specific range of epochs.
    /// @param fromEpoch Start epoch (inclusive).
    /// @param toEpoch End epoch (exclusive).
    function claimRange(uint256 fromEpoch, uint256 toEpoch) external nonReentrant {
        require(fromEpoch < toEpoch, "invalid range");
        require(toEpoch <= epochCount, "epoch out of bounds");
        uint256 totalOwed = _claimRange(msg.sender, fromEpoch, toEpoch);
        if (totalOwed == 0) revert NothingToClaim();
        // Advance lastClaimedEpoch if this range extends it
        if (toEpoch > lastClaimedEpoch[msg.sender]) {
            lastClaimedEpoch[msg.sender] = toEpoch;
        }
        totalClaimedByHolder[msg.sender] += totalOwed;
        usdc.safeTransfer(msg.sender, totalOwed);
    }

    function _claimRange(address holder, uint256 from, uint256 to) internal returns (uint256 totalOwed) {
        for (uint256 i = from; i < to; i++) {
            if (!epochClaimed[i][holder] && _holderSnapshotTaken[i][holder]) {
                uint256 holderBalance = _holderSnapshots[i][holder];
                if (holderBalance > 0) {
                    Epoch storage e = epochs[i];
                    uint256 share = (holderBalance * e.totalAmount) / e.totalSupplySnapshot;
                    if (share > 0) {
                        epochClaimed[i][holder] = true;
                        totalOwed += share;
                        emit DividendClaimed(holder, i, share);
                    }
                }
            }
        }
    }

    /// @notice Returns total claimable USDC for a holder across all epochs.
    function claimable(address holder) external view returns (uint256 total) {
        for (uint256 i = 0; i < epochCount; i++) {
            if (!epochClaimed[i][holder] && _holderSnapshotTaken[i][holder]) {
                uint256 bal = _holderSnapshots[i][holder];
                if (bal > 0) {
                    Epoch storage e = epochs[i];
                    total += (bal * e.totalAmount) / e.totalSupplySnapshot;
                }
            }
        }
    }

    /// @notice Check if a holder has snapshotted for a given epoch.
    function hasSnapshot(uint256 epochIndex, address holder) external view returns (bool) {
        return _holderSnapshotTaken[epochIndex][holder];
    }

    /// @notice Get a holder's snapshotted balance for a given epoch.
    function getHolderSnapshot(uint256 epochIndex, address holder) external view returns (uint256) {
        return _holderSnapshots[epochIndex][holder];
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
