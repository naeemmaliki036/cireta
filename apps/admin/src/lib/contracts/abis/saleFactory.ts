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
] as const;
