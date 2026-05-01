/**
 * IssuerOTCTokenFactory ABI — deploy and look up per-issuer OTC tokens.
 * Source: contracts/src/otc/IssuerOTCTokenFactory.sol
 */
export const OTC_TOKEN_FACTORY_ABI = [
  {
    name: "deployOTCToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "issuerWallet", type: "address" },
      { name: "identityRegistry", type: "address" },
    ],
    outputs: [{ name: "otcToken", type: "address" }],
  },
  {
    name: "getIssuerOTCTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "issuerWallet", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getIssuerOTCTokenCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "issuerWallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "issuerOTCTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "issuerWallet", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "totalOTCTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "OTCTokenDeployed",
    type: "event",
    inputs: [
      { name: "issuer", type: "address", indexed: true },
      { name: "otcToken", type: "address", indexed: true },
    ],
  },
  // ── Admin setters ──
  {
    name: "setOTCTokenImplementation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "impl", type: "address" }],
    outputs: [],
  },
  {
    name: "setIssuerRegistry",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "registry", type: "address" }],
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
    name: "otcTokenImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "issuerRegistry",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
