/**
 * Centralized chain configuration — single source of truth.
 * All chain ID and RPC URL reads go through this module so we never
 * duplicate fallbacks or hardcode network defaults across the codebase.
 */

import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import type { Chain } from "viem";

/** Configured chain ID from env. Throws if missing — fail loudly. */
export function getChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) {
    throw new Error("NEXT_PUBLIC_CHAIN_ID is not set");
  }
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`NEXT_PUBLIC_CHAIN_ID is invalid: "${raw}"`);
  }
  return id;
}

/** Configured RPC URL from env. Throws if missing — fail loudly. */
export function getRpcUrl(): string {
  const url = process.env.NEXT_PUBLIC_RPC_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_RPC_URL is not set");
  }
  return url;
}

/** viem chain object matching the configured chain ID. */
export function getChain(): Chain {
  const id = getChainId();
  switch (id) {
    case base.id: return base;
    case baseSepolia.id: return baseSepolia;
    case mainnet.id: return mainnet;
    case sepolia.id: return sepolia;
    default:
      throw new Error(`Unsupported chain ID: ${id}`);
  }
}

/** Pretty chain name for the configured chain. */
export function getChainName(): string {
  return getChain().name;
}
