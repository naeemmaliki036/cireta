/**
 * RedemptionManager ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/token/RedemptionManager.sol
 * Per-token upgradeable contract; address comes from the token's
 * redemption_manager_address column (or RedemptionFactory.tokenRedemptionManager).
 *
 * Only the surfaces the admin portal calls are included:
 *   - fulfil   (write — owner-only, burns held tokens)
 *   - cancel   (write — issuer can cancel a Pending request)
 *   - requests (read — used to verify state before fulfil)
 *   - RedemptionFulfilled / RedemptionCancelled (events)
 */
export const REDEMPTION_MANAGER_ABI = [
  {
    name: "fulfil",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancel",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "requests",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "investor", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "method", type: "uint8" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint256" },
      { name: "fulfilledAt", type: "uint256" },
    ],
  },
  {
    name: "RedemptionFulfilled",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "investor", type: "address", indexed: true },
    ],
  },
  {
    name: "RedemptionCancelled",
    type: "event",
    anonymous: false,
    inputs: [{ name: "id", type: "uint256", indexed: true }],
  },
] as const;
