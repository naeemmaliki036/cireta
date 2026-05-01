/**
 * LockModule ABI — compliance module that locks specific addresses from transferring.
 * Source: contracts/src/compliance/LockModule.sol
 */
export const LOCK_MODULE_ABI = [
  {
    name: "lockAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "unlockAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "isLocked",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
