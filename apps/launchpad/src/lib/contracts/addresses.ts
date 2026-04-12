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

function _requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in .env.local`);
  }
  return value;
}

// Base Mainnet (8453)
const BASE_MAINNET: ChainAddresses = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  saleFactory: (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) || null,
  tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`) || null,
};

// Base Sepolia (84532) / Sepolia (11155111) — built lazily to avoid crashing
// when NEXT_PUBLIC_USDC_ADDRESS isn't set and the user is on mainnet.
function getTestnet(): ChainAddresses {
  return {
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
    saleFactory: (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) || null,
    tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
    identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`) || null,
  };
}

const ADDRESSES: Record<number, () => ChainAddresses> = {
  8453: () => BASE_MAINNET,
  84532: getTestnet,
  11155111: getTestnet,
};

/**
 * Guard: require a non-null contract address or throw with the missing env var name.
 */
export function requireAddress(
  addr: `0x${string}` | null,
  name: string
): `0x${string}` {
  if (!addr) {
    throw new Error(
      `Contract address not configured: ${name}. Set NEXT_PUBLIC_${name.toUpperCase()}_ADDRESS in your environment.`
    );
  }
  return addr;
}

export function getAddresses(chainId: number): ChainAddresses {
  const factory = ADDRESSES[chainId];
  if (!factory) {
    throw new Error(
      `Unsupported chain ID: ${chainId}. Please switch to a supported network.`
    );
  }
  return factory();
}

export function getUsdcAddress(chainId: number): `0x${string}` {
  return getAddresses(chainId).usdc;
}

/**
 * BaseScan URL for a given chain.
 */
export function getExplorerUrl(chainId: number): string {
  if (chainId === 84532) return "https://sepolia.basescan.org";
  if (chainId === 11155111) return "https://sepolia.etherscan.io";
  return "https://basescan.org";
}

export function getTxUrl(chainId: number, txHash: string): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}
