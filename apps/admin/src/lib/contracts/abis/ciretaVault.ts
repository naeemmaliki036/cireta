/**
 * CiretaVault ABI — admin portal subset.
 *
 * Source: contracts/src/vault/CiretaVault.sol
 * ExcessPolicy enum: 0 = Keep, 1 = BurnToMatch
 */
export const CIRETA_VAULT_ABI = [
  {
    name: "setExcessPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_policy", type: "uint8" }],
    outputs: [],
  },
  {
    name: "excessPolicy",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** ExcessPolicy enum: 0 = Keep, 1 = BurnToMatch */
export const EXCESS_POLICY_LABELS: Record<number, string> = {
  0: "Keep (hold excess in vault)",
  1: "BurnToMatch (burn excess fractions)",
};
