/**
 * Contract addresses per chain.
 *
 * All addresses loaded from environment variables at build time.
 * NEVER hardcode deployed addresses here — use NEXT_PUBLIC_ env vars.
 */

interface ChainAddresses {
  usdc: `0x${string}`;
  saleFactory: `0x${string}` | null;
  tokenFactory: `0x${string}` | null;
  identityRegistry: `0x${string}` | null;
}

// Base Mainnet (8453)
const BASE_MAINNET: ChainAddresses = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  saleFactory: (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) ?? null,
  tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) ?? null,
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`) ?? null,
};

// Base Sepolia (84532)
const BASE_SEPOLIA: ChainAddresses = {
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`) ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  saleFactory: (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) ?? null,
  tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) ?? null,
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`) ?? null,
};

const ADDRESSES: Record<number, ChainAddresses> = {
  8453: BASE_MAINNET,
  84532: BASE_SEPOLIA,
};

export function getAddresses(chainId: number): ChainAddresses {
  return ADDRESSES[chainId] ?? BASE_MAINNET;
}

export function getUsdcAddress(chainId: number): `0x${string}` {
  return getAddresses(chainId).usdc;
}

/**
 * BaseScan URL for a given chain.
 */
export function getExplorerUrl(chainId: number): string {
  if (chainId === 84532) return "https://sepolia.basescan.org";
  return "https://basescan.org";
}

export function getTxUrl(chainId: number, txHash: string): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}
