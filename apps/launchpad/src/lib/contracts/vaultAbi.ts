/**
 * CiretaVault contract ABI — subset needed for frontend interactions.
 *
 * Source: contracts/src/vault/CiretaVault.sol
 */
export const VAULT_ABI = [
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "getClaimable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "investor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getVested",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "investor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getBackingRatio",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "locked", type: "uint256" },
      { name: "fractionSupply", type: "uint256" },
    ],
  },
  {
    name: "finalized",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "vestingStartTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vestingConfig",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "cliffDuration", type: "uint256" },
      { name: "vestingDuration", type: "uint256" },
    ],
  },
  {
    name: "investorVesting",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "totalFractions", type: "uint256" },
      { name: "claimedAmount", type: "uint256" },
      { name: "vestingStart", type: "uint256" },
    ],
  },
  // Events
  {
    name: "TokensClaimed",
    type: "event",
    inputs: [
      { name: "investor", type: "address", indexed: true },
      { name: "fractionsBurned", type: "uint256", indexed: false },
      { name: "projectTokensReleased", type: "uint256", indexed: false },
    ],
  },
] as const;
