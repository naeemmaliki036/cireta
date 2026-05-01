/**
 * MaxBalanceModule ABI — caps each holder's token balance.
 * Source: contracts/src/compliance/MaxBalanceModule.sol
 */
export const MAX_BALANCE_MODULE_ABI = [
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
