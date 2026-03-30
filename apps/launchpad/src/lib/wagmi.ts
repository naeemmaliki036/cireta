import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http, type Config } from "wagmi";

if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required. Set it in .env.local");
}
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

let _config: Config | null = null;

// Default to Base Sepolia first for testnet phase
if (!process.env.NEXT_PUBLIC_CHAIN_ID) {
  throw new Error("NEXT_PUBLIC_CHAIN_ID is required. Set it in .env.local");
}
if (!process.env.NEXT_PUBLIC_RPC_URL) {
  throw new Error("NEXT_PUBLIC_RPC_URL is required. Set it in .env.local");
}
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const chains =
  chainId === 84532 ? ([baseSepolia, base] as const) : ([base, baseSepolia] as const);

export function getWagmiConfig(): Config {
  if (!_config) {
    _config = getDefaultConfig({
      appName: "Cireta Launchpad",
      projectId: walletConnectProjectId,
      chains,
      transports: {
        [base.id]: http(rpcUrl),
        [baseSepolia.id]: http(rpcUrl),
      },
      ssr: true,
    });
  }
  return _config;
}

// For backward compat — but only call in client context
export const config = typeof window !== "undefined" ? getWagmiConfig() : (null as unknown as Config);

declare module "wagmi" {
  interface Register {
    config: Config;
  }
}
