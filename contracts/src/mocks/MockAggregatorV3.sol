// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockAggregatorV3
 * @dev Mock Chainlink AggregatorV3Interface for testing ChainlinkPoRChecker.
 *      Allows configuring answer and updatedAt for test scenarios.
 */
contract MockAggregatorV3 {
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(int256 initialAnswer) {
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    /**
     * @notice Set the answer value.
     */
    function setAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _roundId++;
    }

    /**
     * @notice Set the updatedAt timestamp.
     */
    function setUpdatedAt(uint256 newUpdatedAt) external {
        _updatedAt = newUpdatedAt;
        _roundId++;
    }

    /**
     * @notice Set both answer and updatedAt at once.
     */
    function setRoundData(int256 newAnswer, uint256 newUpdatedAt) external {
        _answer = newAnswer;
        _updatedAt = newUpdatedAt;
        _roundId++;
    }

    /**
     * @notice Implement AggregatorV3Interface.latestRoundData
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            _roundId,
            _answer,
            _updatedAt, // startedAt same as updatedAt for simplicity
            _updatedAt,
            _roundId
        );
    }

    /**
     * @notice Get current answer.
     */
    function getAnswer() external view returns (int256) {
        return _answer;
    }

    /**
     * @notice Get updatedAt timestamp.
     */
    function getUpdatedAt() external view returns (uint256) {
        return _updatedAt;
    }
}
