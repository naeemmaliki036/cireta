/**
 * CiretaSaleFactory ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/CiretaSaleFactory.sol
 */
export const SALE_FACTORY_ABI = [
  {
    name: "deploySale",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "initData", type: "bytes" },
    ],
    outputs: [{ name: "sale", type: "address" }],
  },
  {
    name: "deploySaleVested",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "initData", type: "bytes" },
      { name: "fractionName", type: "string" },
      { name: "fractionSymbol", type: "string" },
      { name: "fractionDecimals", type: "uint8" },
      { name: "identityRegistry", type: "address" },
      { name: "cliffDuration", type: "uint256" },
      { name: "vestingDuration", type: "uint256" },
      { name: "excessPolicy", type: "uint8" },
    ],
    outputs: [
      { name: "sale", type: "address" },
      { name: "vaultAddr", type: "address" },
      { name: "fractionAddr", type: "address" },
    ],
  },
  {
    name: "SaleDeployed",
    type: "event",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "sale", type: "address", indexed: true },
      { name: "issuer", type: "address", indexed: true },
    ],
  },
  // Custom errors — needed for viem to decode revert reasons
  { name: "NotActiveIssuer", type: "error", inputs: [] },
  { name: "ZeroAddress", type: "error", inputs: [] },
  { name: "FeeMismatch", type: "error", inputs: [] },
  { name: "IssuerMismatch", type: "error", inputs: [] },
  { name: "FactoryMismatch", type: "error", inputs: [] },
  // ── Admin setters ──
  {
    name: "setSaleImplementation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "impl", type: "address" }],
    outputs: [],
  },
  {
    name: "setFractionFactory",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "factory", type: "address" }],
    outputs: [],
  },
  {
    name: "setFractionVaultImpl",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "impl", type: "address" }],
    outputs: [],
  },
  {
    name: "setFractionTokenImpl",
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
    name: "setPlatformFeeManager",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "feeManager", type: "address" }],
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
    name: "saleImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "fractionFactory",
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
  {
    name: "platformFeeManager",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
