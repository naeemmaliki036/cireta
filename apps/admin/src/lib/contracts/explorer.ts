// Block explorer URL builder. Driven by NEXT_PUBLIC_CHAIN_ID.

const EXPLORER_BY_CHAIN: Record<number, string> = {
  1: "https://etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  11155111: "https://sepolia.etherscan.io",
};

function getChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  return raw ? Number(raw) : 84532;
}

export function getExplorerBaseUrl(): string {
  return EXPLORER_BY_CHAIN[getChainId()] ?? "https://sepolia.basescan.org";
}

export function getAddressExplorerUrl(address: string): string {
  return `${getExplorerBaseUrl()}/address/${address}`;
}

export function getTxExplorerUrl(txHash: string): string {
  return `${getExplorerBaseUrl()}/tx/${txHash}`;
}
