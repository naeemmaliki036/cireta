/**
 * SimpleIdentityRegistry ABI subset — only the entries needed by the
 * admin emergency manual sync flow. Source:
 * contracts/src/identity/SimpleIdentityRegistry.sol
 */
export const SIMPLE_IDENTITY_REGISTRY_ABI = [
  {
    name: "addToWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "country", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "removeFromWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [],
  },
  {
    name: "isVerified",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "userAddress", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
