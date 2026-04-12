/**
 * ModularCompliance ABI — manages compliance modules bound to a token.
 * Source: contracts/src/compliance/ModularCompliance.sol (ERC-3643)
 */
export const MODULAR_COMPLIANCE_ABI = [
  {
    name: "addModule",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "module", type: "address" }],
    outputs: [],
  },
  {
    name: "removeModule",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "module", type: "address" }],
    outputs: [],
  },
  {
    name: "getModules",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "isModuleBound",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "module", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
