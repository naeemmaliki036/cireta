/**
 * SimpleIdentityRegistry ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/identity/SimpleIdentityRegistry.sol
 * Includes role-based access control functions (AccessControlUpgradeable).
 */
export const SIMPLE_IDENTITY_REGISTRY_ABI = [
  // ── Whitelist Management ──
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
    name: "batchRemoveFromWhitelist",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "wallets", type: "address[]" }],
    outputs: [],
  },
  // ── Read Functions ──
  {
    name: "isVerified",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "userAddress", type: "address" }],
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
    name: "investorCountry",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "userAddress", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  // ── Legacy Agent Management (backward compat) ──
  {
    name: "addAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    name: "removeAgent",
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
  // ── Role-Based Access Control (AccessControlUpgradeable) ──
  {
    name: "grantRole",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "revokeRole",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
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
    name: "REGISTRAR_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "COMPLIANCE_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "AGENT_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "DEFAULT_ADMIN_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "migrateToRoles",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // ── Events ──
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
  {
    name: "RoleGranted",
    type: "event",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
  },
  {
    name: "RoleRevoked",
    type: "event",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
  },
] as const;
