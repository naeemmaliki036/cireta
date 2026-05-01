/**
 * TransferRestrictModule ABI — compliance module for approved sender/receiver pairs.
 * Source: contracts/src/compliance/TransferRestrictModule.sol
 */
export const TRANSFER_RESTRICT_MODULE_ABI = [
  {
    name: "approveAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "revokeAddress",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "isApproved",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "compliance", type: "address" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
