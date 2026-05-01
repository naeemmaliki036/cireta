/**
 * ConditionalTransferModule ABI — compliance module that gates transfers on per-address approval.
 * Source: contracts/src/compliance/ConditionalTransferModule.sol
 */
export const CONDITIONAL_TRANSFER_MODULE_ABI = [
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
