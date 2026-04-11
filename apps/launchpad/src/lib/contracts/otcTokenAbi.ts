/**
 * OTC Token ABI — for investor buyOTC flow.
 */
export const OTC_TOKEN_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

/**
 * Sale ABI extension for OTC — adds buyOTC and otcToken view.
 */
export const SALE_OTC_ABI = [
  { name: "buyOTC", type: "function", stateMutability: "nonpayable", inputs: [{ name: "phaseId", type: "uint256" }, { name: "tokenQty", type: "uint256" }], outputs: [] },
  { name: "otcToken", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;
