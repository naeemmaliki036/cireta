/**
 * PlatformFeeManager ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/PlatformFeeManager.sol
 */
export const PLATFORM_FEE_MANAGER_ABI = [
  {
    name: "feeReceiver",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "defaultFeeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getFeeForIssuer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "issuer", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "setFeeReceiver",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newReceiver", type: "address" }],
    outputs: [],
  },
  {
    name: "setDefaultFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newFeeBps", type: "uint256" }],
    outputs: [],
  },
  {
    name: "setIssuerFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "issuer", type: "address" },
      { name: "feeBps", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
