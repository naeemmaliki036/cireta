/**
 * CiretaTokenFactory ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/CiretaTokenFactory.sol
 * Updated signature: deployToken now accepts 8 params (added identityRegistry,
 * maxSupply, mintable, initialMintAmount) matching the v2 contract.
 */
export const TOKEN_FACTORY_ABI = [
  {
    name: "deployToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "issuer", type: "address" },
      { name: "identityRegistry", type: "address" },
      { name: "maxSupply", type: "uint256" },
      { name: "mintable", type: "bool" },
      { name: "initialMintAmount", type: "uint256" },
    ],
    outputs: [
      { name: "tokenProxy", type: "address" },
      { name: "identityRegistryProxy", type: "address" },
      { name: "complianceProxy", type: "address" },
    ],
  },
  {
    name: "TokenDeployed",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "identityRegistry", type: "address", indexed: true },
      { name: "compliance", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "issuer", type: "address", indexed: false },
    ],
  },
  {
    name: "simpleIdentityMode",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  // ── Admin setters ──
  {
    name: "updateImplementations",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenImpl", type: "address" },
      { name: "identityRegistryImpl", type: "address" },
      { name: "complianceImpl", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setSimpleIdentityMode",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "identityRegistryImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "complianceImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
