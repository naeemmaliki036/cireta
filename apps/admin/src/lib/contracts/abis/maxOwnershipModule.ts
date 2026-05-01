/**
 * MaxOwnershipModule ABI — caps each holder's token balance (ownership cap).
 * Source: contracts/src/compliance/MaxOwnershipModule.sol
 *
 * Note: the contract uses the same function names as MaxBalanceModule
 * (setMaxBalance / getMaxBalance). Both enforce an absolute token-amount
 * ceiling per address, not a percentage of supply — the distinction is
 * semantic/governance only.
 */
export const MAX_OWNERSHIP_MODULE_ABI = [
  {
    name: "setMaxBalance",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "max", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getMaxBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "compliance", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
