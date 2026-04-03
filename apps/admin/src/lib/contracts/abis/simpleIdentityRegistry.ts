/**
 * SimpleIdentityRegistry ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/identity/SimpleIdentityRegistry.sol
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
    name: "batchAddToWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallets", type: "address[]" },
      { name: "countries", type: "uint16[]" },
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
  {
    name: "addAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    name: "isAgent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "whitelistedCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "IdentityRegistered",
    type: "event",
    inputs: [
      { name: "investorAddress", type: "address", indexed: true },
      { name: "identity", type: "address", indexed: true },
    ],
  },
  {
    name: "IdentityRemoved",
    type: "event",
    inputs: [
      { name: "investorAddress", type: "address", indexed: true },
      { name: "identity", type: "address", indexed: true },
    ],
  },
] as const;
