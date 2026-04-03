/**
 * IssuerRegistry ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/IssuerRegistry.sol
 */
export const ISSUER_REGISTRY_ABI = [
  {
    name: "registerIssuer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "name", type: "string" },
      { name: "jurisdiction", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "activateIssuer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [],
  },
  {
    name: "isActiveIssuer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getIssuer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "name", type: "string" },
          { name: "jurisdiction", type: "string" },
          { name: "status", type: "uint8" },
          { name: "registeredAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "IssuerRegistered",
    type: "event",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "jurisdiction", type: "string", indexed: false },
    ],
  },
  {
    name: "IssuerActivated",
    type: "event",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
    ],
  },
] as const;
