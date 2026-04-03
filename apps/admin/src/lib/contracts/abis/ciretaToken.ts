/**
 * CiretaToken ABI — ERC-3643 security token.
 * Source: contracts/src/token/CiretaToken.sol
 */
export const CIRETA_TOKEN_ABI = [
  { name: "mint", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "burn", type: "function", stateMutability: "nonpayable", inputs: [{ name: "account", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "identityRegistry", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "compliance", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "pause", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "unpause", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "setAddressFrozen", type: "function", stateMutability: "nonpayable", inputs: [{ name: "addr", type: "address" }, { name: "freeze", type: "bool" }], outputs: [] },
  { name: "forcedTransfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "recoveryAddress", type: "function", stateMutability: "nonpayable", inputs: [{ name: "lostWallet", type: "address" }, { name: "newWallet", type: "address" }, { name: "investorOnchainID", type: "address" }], outputs: [] },
  { name: "isFrozen", type: "function", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "", type: "bool" }] },
] as const;
