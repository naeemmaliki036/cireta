/**
 * CiretaRedemptionFactory ABI — subset for admin portal interactions.
 *
 * Source: contracts/src/platform/CiretaRedemptionFactory.sol
 * Live on base-sepolia (84532): 0x2C87c774728EE581b3e39B4562B65676b203E6B4
 *
 * Only the 3 surfaces used by the admin portal are included:
 *   - deployRedemptionManager (write)
 *   - tokenRedemptionManager  (read)
 *   - RedemptionManagerDeployed (event)
 */
export const REDEMPTION_FACTORY_ABI = [
  {
    name: "deployRedemptionManager",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "rm", type: "address" }],
  },
  {
    name: "tokenRedemptionManager",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "RedemptionManagerDeployed",
    type: "event",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "redemptionManager", type: "address", indexed: true },
      { name: "issuer", type: "address", indexed: true },
    ],
  },
  // Custom errors — needed for viem to decode revert reasons
  { name: "ZeroAddress", type: "error", inputs: [] },
  {
    name: "AlreadyDeployed",
    type: "error",
    inputs: [{ name: "existing", type: "address" }],
  },
] as const;
