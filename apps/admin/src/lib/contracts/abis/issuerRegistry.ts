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
    name: "suspendIssuer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "reactivateIssuer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [],
  },
  {
    name: "ISSUER_MANAGER_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "hasRole",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "IssuerActivated",
    type: "event",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
    ],
  },
  {
    name: "IssuerSuspended",
    type: "event",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    name: "updateIssuer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "newName", type: "string" },
      { name: "newJurisdiction", type: "string" },
    ],
    outputs: [],
  },
] as const;
