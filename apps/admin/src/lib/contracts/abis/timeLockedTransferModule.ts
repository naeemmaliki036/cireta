/**
 * TimeLockedTransferModule ABI — blocks transfers until a unix timestamp.
 * Source: contracts/src/compliance/TimeLockedTransferModule.sol
 */
export const TIME_LOCKED_TRANSFER_MODULE_ABI = [
  {
    name: "setUnlockTime",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getUnlockTime",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "compliance", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isUnlocked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "compliance", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
