// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title VestingVault
 * @dev Vesting contract for gradual token release
 */
contract VestingVault is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint256 totalAmount;        // Total tokens in schedule
        uint256 claimedAmount;      // Already claimed
        uint256 startTime;          // Vesting start
        uint256 cliffEnd;           // Cliff end timestamp
        uint256 vestingEnd;         // Full vesting timestamp
        bool revoked;
    }

    // Token being vested
    IERC20 public token;

    // Vesting schedules per beneficiary
    mapping(address => VestingSchedule[]) public schedules;

    // Events
    event ScheduleCreated(
        address indexed beneficiary,
        uint256 indexed scheduleId,
        uint256 totalAmount,
        uint256 cliffEnd,
        uint256 vestingEnd
    );
    event TokensClaimed(
        address indexed beneficiary,
        uint256 indexed scheduleId,
        uint256 amount
    );
    event ScheduleRevoked(
        address indexed beneficiary,
        uint256 indexed scheduleId,
        uint256 unvestedAmount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _token, address initialOwner) public initializer {
        require(_token != address(0), "zero token");

        __Ownable_init(initialOwner);

        token = IERC20(_token);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Schedule Management ============

    function createSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyOwner returns (uint256 scheduleId) {
        require(beneficiary != address(0), "zero beneficiary");
        require(totalAmount > 0, "zero amount");
        require(vestingDuration > 0, "zero vesting duration");
        require(cliffDuration <= vestingDuration, "cliff > vesting");

        uint256 cliffEnd = startTime + cliffDuration;
        uint256 vestingEnd = startTime + vestingDuration;

        schedules[beneficiary].push(VestingSchedule({
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: startTime,
            cliffEnd: cliffEnd,
            vestingEnd: vestingEnd,
            revoked: false
        }));

        scheduleId = schedules[beneficiary].length - 1;

        // Transfer tokens to vault
        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        emit ScheduleCreated(
            beneficiary,
            scheduleId,
            totalAmount,
            cliffEnd,
            vestingEnd
        );
    }

    function batchCreateSchedules(
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyOwner {
        require(beneficiaries.length == amounts.length, "length mismatch");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        // Transfer all tokens at once
        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        uint256 cliffEnd = startTime + cliffDuration;
        uint256 vestingEnd = startTime + vestingDuration;

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            require(beneficiaries[i] != address(0), "zero beneficiary");
            require(amounts[i] > 0, "zero amount");

            schedules[beneficiaries[i]].push(VestingSchedule({
                totalAmount: amounts[i],
                claimedAmount: 0,
                startTime: startTime,
                cliffEnd: cliffEnd,
                vestingEnd: vestingEnd,
                revoked: false
            }));

            emit ScheduleCreated(
                beneficiaries[i],
                schedules[beneficiaries[i]].length - 1,
                amounts[i],
                cliffEnd,
                vestingEnd
            );
        }
    }

    function revokeSchedule(
        address beneficiary,
        uint256 scheduleId
    ) external onlyOwner {
        require(scheduleId < schedules[beneficiary].length, "invalid schedule");
        VestingSchedule storage schedule = schedules[beneficiary][scheduleId];
        require(!schedule.revoked, "already revoked");

        uint256 vested = _calculateVested(schedule);
        uint256 unvested = schedule.totalAmount - vested;

        schedule.revoked = true;

        // Return unvested tokens to owner
        if (unvested > 0) {
            token.safeTransfer(owner(), unvested);
        }

        emit ScheduleRevoked(beneficiary, scheduleId, unvested);
    }

    // ============ Claiming ============

    function claim(uint256 scheduleId) external nonReentrant {
        require(scheduleId < schedules[msg.sender].length, "invalid schedule");
        VestingSchedule storage schedule = schedules[msg.sender][scheduleId];

        require(!schedule.revoked, "schedule revoked");
        require(block.timestamp >= schedule.cliffEnd, "cliff not reached");

        uint256 vested = _calculateVested(schedule);
        uint256 claimable = vested - schedule.claimedAmount;
        require(claimable > 0, "nothing to claim");

        schedule.claimedAmount += claimable;

        token.safeTransfer(msg.sender, claimable);

        emit TokensClaimed(msg.sender, scheduleId, claimable);
    }

    function claimAll() external nonReentrant {
        uint256 totalClaimable = 0;

        for (uint256 i = 0; i < schedules[msg.sender].length; i++) {
            VestingSchedule storage schedule = schedules[msg.sender][i];

            if (schedule.revoked || block.timestamp < schedule.cliffEnd) {
                continue;
            }

            uint256 vested = _calculateVested(schedule);
            uint256 claimable = vested - schedule.claimedAmount;

            if (claimable > 0) {
                schedule.claimedAmount += claimable;
                totalClaimable += claimable;
                emit TokensClaimed(msg.sender, i, claimable);
            }
        }

        require(totalClaimable > 0, "nothing to claim");
        token.safeTransfer(msg.sender, totalClaimable);
    }

    // ============ View Functions ============

    function getScheduleCount(address beneficiary) external view returns (uint256) {
        return schedules[beneficiary].length;
    }

    function getSchedule(
        address beneficiary,
        uint256 scheduleId
    ) external view returns (VestingSchedule memory) {
        require(scheduleId < schedules[beneficiary].length, "invalid schedule");
        return schedules[beneficiary][scheduleId];
    }

    function getClaimable(
        address beneficiary,
        uint256 scheduleId
    ) external view returns (uint256) {
        require(scheduleId < schedules[beneficiary].length, "invalid schedule");
        VestingSchedule storage schedule = schedules[beneficiary][scheduleId];

        if (schedule.revoked || block.timestamp < schedule.cliffEnd) {
            return 0;
        }

        uint256 vested = _calculateVested(schedule);
        return vested - schedule.claimedAmount;
    }

    function getTotalClaimable(address beneficiary) external view returns (uint256) {
        uint256 total = 0;

        for (uint256 i = 0; i < schedules[beneficiary].length; i++) {
            VestingSchedule storage schedule = schedules[beneficiary][i];

            if (schedule.revoked || block.timestamp < schedule.cliffEnd) {
                continue;
            }

            uint256 vested = _calculateVested(schedule);
            total += vested - schedule.claimedAmount;
        }

        return total;
    }

    function _calculateVested(
        VestingSchedule storage schedule
    ) internal view returns (uint256) {
        if (block.timestamp < schedule.cliffEnd) {
            return 0;
        }

        if (block.timestamp >= schedule.vestingEnd) {
            return schedule.totalAmount;
        }

        uint256 elapsed = block.timestamp - schedule.startTime;
        uint256 duration = schedule.vestingEnd - schedule.startTime;

        return (schedule.totalAmount * elapsed) / duration;
    }
}
