/**
 * Centralized chain configuration — single source of truth.
 * All chain ID and RPC URL reads go through this module so we never
 * duplicate fallbacks or hardcode network defaults across the codebase.
 */

import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { http, fallback, type Chain, type Transport } from "viem";

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

/**
 * Public fallback RPCs by chain ID — used so one provider's outage or
 * rate-limit (e.g. Alchemy 429) doesn't silently break every on-chain read.
 */
const PUBLIC_FALLBACKS: Record<number, string[]> = {
  [base.id]: [
    "https://base.publicnode.com",
    "https://mainnet.base.org",
  ],
  [baseSepolia.id]: [
    "https://base-sepolia.publicnode.com",
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com",
  ],
};

/**
 * Build a viem transport for the configured chain with the env RPC as primary
 * and public fallbacks behind it.
 */
export function getTransport(): Transport {
  const id = getChainId();
  const urls = Array.from(new Set([getRpcUrl(), ...(PUBLIC_FALLBACKS[id] ?? [])]));
  return fallback(urls.map((u) => http(u)));
}
