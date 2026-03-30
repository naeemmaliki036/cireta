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

function requireEnv(name: string): string {
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

// Base Sepolia (84532) / Sepolia (11155111)
const TESTNET: ChainAddresses = {
  usdc: requireEnv("NEXT_PUBLIC_USDC_ADDRESS") as `0x${string}`,
  saleFactory: (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) || null,
  tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}`) || null,
};

const ADDRESSES: Record<number, ChainAddresses> = {
  8453: BASE_MAINNET,
  84532: TESTNET,
  11155111: TESTNET,
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
  const addrs = ADDRESSES[chainId];
  if (!addrs) {
    throw new Error(
      `Unsupported chain ID: ${chainId}. Cireta supports Base Mainnet (8453), Base Sepolia (84532), and Sepolia (11155111).`
    );
  }
  return addrs;
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
