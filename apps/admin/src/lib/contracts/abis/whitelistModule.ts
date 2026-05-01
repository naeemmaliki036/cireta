/**
 * WhitelistModule ABI — compliance module for per-address whitelist.
 * Source: contracts/src/compliance/WhitelistModule.sol
 */
export const WHITELIST_MODULE_ABI = [
  {
    name: "whitelistAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "dewhitelistAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "batchWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "accounts", type: "address[]" },
    ],
    outputs: [],
  },
  {
    name: "isWhitelisted",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
