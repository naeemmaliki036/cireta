// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title CiretaUSDC (cUSDC)
 * @notice Mock stablecoin for testnet use. Unlimited supply, open minting.
 * @dev Anyone can mint freely — DO NOT deploy to mainnet.
 */
contract CiretaUSDC is ERC20 {
    constructor() ERC20("Cireta USDC Mock", "cUSDC") {}

    /// @notice 6 decimals to match real USDC.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open mint — anyone can mint any amount (testnet only).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Convenience: mint to caller.
    function faucet(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
