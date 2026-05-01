/**
 * CiretaFractionFactory ABI — admin setters for implementation upgrades.
 * Source: contracts/src/platform/CiretaFractionFactory.sol
 */
export const FRACTION_FACTORY_ABI = [
  {
    name: "setFractionTokenImplementation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "impl", type: "address" }],
    outputs: [],
  },
  {
    name: "setVaultImplementation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "impl", type: "address" }],
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
    name: "fractionTokenImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "vaultImplementation",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
