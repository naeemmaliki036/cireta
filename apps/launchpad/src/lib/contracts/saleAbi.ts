/**
 * Sale contract ABI — subset needed for frontend interactions.
 *
 * Source: contracts/src/sale/Sale.sol
 */
export const SALE_ABI = [
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "phaseId", type: "uint256" },
      { name: "tokenQty", type: "uint256" },
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
    name: "hardCap",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "softCap",
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
    name: "tokenDecimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    // Round-5: Phase struct gained topUpMin + allocationMode (uint8 enum)
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
          { name: "minTokens", type: "uint256" },
          { name: "maxTokens", type: "uint256" },
          { name: "topUpMinTokens", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "whitelistOnly", type: "bool" },
          { name: "allocationMode", type: "uint8" },
        ],
      },
    ],
  },
  {
    // Round-5: Contribution struct dropped isOtc
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
        ],
      },
    ],
  },
  // Round-5: split payment-token vs OTC contribution mappings.
  // "payment" = whatever stable the sale uses (USDC, USDT, etc.) — generic.
  {
    name: "paymentContributed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "otcContributed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Round-5: open-ended sale flag
  {
    name: "openEnded",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  // Round-5: refund activation gate
  {
    name: "refundsActive",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  // Round-5: finalization pending flag (set when hardcap or supply hit)
  {
    name: "finalizationPending",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  // Round-5: total token supply
  {
    name: "totalTokenSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalTokenSold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
