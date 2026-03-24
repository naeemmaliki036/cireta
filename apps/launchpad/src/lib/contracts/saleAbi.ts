/**
 * Sale contract ABI — subset needed for frontend interactions.
 *
 * Source: contracts/src/sale/Sale.sol
 */
export const SALE_ABI = [
  {
    name: "contribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "phaseId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "claimTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "status",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "totalRaised",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPhaseCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPhase",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "phaseId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "pricePerToken", type: "uint256" },
          { name: "allocation", type: "uint256" },
          { name: "sold", type: "uint256" },
          { name: "minContribution", type: "uint256" },
          { name: "maxContribution", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "whitelistOnly", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getContribution",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "contributor", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "tokensAllocated", type: "uint256" },
          { name: "claimed", type: "bool" },
          { name: "refunded", type: "bool" },
          { name: "isOtc", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "totalContributed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getCurrentPhase",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "ContributionMade",
    type: "event",
    inputs: [
      { name: "contributor", type: "address", indexed: true },
      { name: "phaseId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "tokensAllocated", type: "uint256", indexed: false },
    ],
  },
] as const;
