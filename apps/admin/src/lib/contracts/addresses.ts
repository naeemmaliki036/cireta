/**
 * Contract addresses for admin portal on-chain interactions.
 *
 * All addresses loaded from NEXT_PUBLIC_ env vars at build time.
 * NEVER hardcode deployed addresses — use environment variables.
 */

export interface ContractAddresses {
  tokenFactory: `0x${string}` | null;
  saleFactory: `0x${string}` | null;
  fractionFactory: `0x${string}` | null;
  otcTokenFactory: `0x${string}` | null;
  issuerRegistry: `0x${string}` | null;
  platformFeeManager: `0x${string}` | null;
}

const addresses: ContractAddresses = {
  tokenFactory:
    (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
  saleFactory:
    (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) || null,
  fractionFactory:
    (process.env.NEXT_PUBLIC_FRACTION_FACTORY_ADDRESS as `0x${string}`) || null,
  otcTokenFactory:
    (process.env.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
  issuerRegistry:
    (process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS as `0x${string}`) || null,
  platformFeeManager:
    (process.env.NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS as `0x${string}`) || null,
};

/**
 * Get a contract address or throw if not configured.
 */
export function requireAddress(
  key: keyof ContractAddresses,
): `0x${string}` {
  const addr = addresses[key];
  if (!addr) {
    throw new Error(
      `Contract address not configured: ${key}. Set NEXT_PUBLIC_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}_ADDRESS in your environment.`,
    );
  }
  return addr;
}

export function getAddresses(): ContractAddresses {
  return addresses;
}

/**
 * BaseScan URL helpers.
 */
export function getExplorerUrl(chainId?: number): string | null {
  if (process.env.NEXT_PUBLIC_EXPLORER_URL) return process.env.NEXT_PUBLIC_EXPLORER_URL;
  if (chainId === 84532) return "https://sepolia.basescan.org";
  if (chainId === 11155111) return "https://sepolia.etherscan.io";
  if (chainId === 8453) return "https://basescan.org";
  if (chainId === 1) return "https://etherscan.io";
  return null;
}

export function getTxUrl(chainId: number, txHash: string): string | null {
  const base = getExplorerUrl(chainId);
  return base ? `${base}/tx/${txHash}` : null;
}

export function getAddressUrl(chainId: number, address: string): string | null {
  const base = getExplorerUrl(chainId);
  return base ? `${base}/address/${address}` : null;
}
