/**
 * Contract addresses for admin portal on-chain interactions.
 *
 * All addresses loaded from NEXT_PUBLIC_ env vars at build time.
 * NEVER hardcode deployed addresses — use environment variables.
 */

export interface ContractAddresses {
  tokenFactory: `0x${string}` | null;
  saleFactory: `0x${string}` | null;
  issuerRegistry: `0x${string}` | null;
  platformFeeManager: `0x${string}` | null;
  ciretaUsdc: `0x${string}` | null;
}

const addresses: ContractAddresses = {
  tokenFactory:
    (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`) || null,
  saleFactory:
    (process.env.NEXT_PUBLIC_SALE_FACTORY_ADDRESS as `0x${string}`) || null,
  issuerRegistry:
    (process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS as `0x${string}`) || null,
  platformFeeManager:
    (process.env.NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS as `0x${string}`) || null,
  ciretaUsdc:
    (process.env.NEXT_PUBLIC_CIRETA_USDC_ADDRESS as `0x${string}`) || null,
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
export function getExplorerUrl(chainId: number): string {
  if (chainId === 84532) return "https://sepolia.basescan.org";
  if (chainId === 11155111) return "https://sepolia.etherscan.io";
  return "https://basescan.org";
}

export function getTxUrl(chainId: number, txHash: string): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}

export function getAddressUrl(chainId: number, address: string): string {
  return `${getExplorerUrl(chainId)}/address/${address}`;
}
