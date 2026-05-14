/**
 * RedemptionManager ABI — subset needed for investor redemption flow.
 *
 * Source: contracts/src/redemption/RedemptionManager.sol
 *
 * method enum: 0 = Cash, 1 = Physical
 * status enum: 0 = Pending, 1 = Processing, 2 = Fulfilled, 3 = Cancelled
 */
export const REDEMPTION_MANAGER_ABI = [
  {
    name: "requestRedemption",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "method", type: "uint8" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "cancel",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "requestCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "requests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "investor", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "method", type: "uint8" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
          { name: "fulfilledAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getInvestorRequests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "investor", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  // Events
  {
    name: "RedemptionRequested",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "investor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RedemptionFulfilled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "investor", type: "address", indexed: true },
    ],
  },
  {
    name: "RedemptionCancelled",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
    ],
  },
] as const;

/** Human-readable labels for the on-chain status enum */
export const REDEMPTION_STATUS_LABEL: Record<number, string> = {
  0: "Pending",
  1: "Processing",
  2: "Fulfilled",
  3: "Cancelled",
};

/** Human-readable labels for the on-chain method enum */
export const REDEMPTION_METHOD_LABEL: Record<number, string> = {
  0: "Cash",
  1: "Physical",
};
