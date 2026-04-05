/**
 * CiretaTokenFactory ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/CiretaTokenFactory.sol
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
] as const;
