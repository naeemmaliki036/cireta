import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  rainbowWallet,
  rabbyWallet,
  safeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { base, baseSepolia } from "wagmi/chains";
import { http, type Config } from "wagmi";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "placeholder";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://base-sepolia-rpc.publicnode.com";

const chains =
  chainId === 84532 ? ([baseSepolia, base] as const) : ([base, baseSepolia] as const);

let _config: Config | null = null;

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
      wallets: [
        {
          groupName: "Recommended",
          wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, rainbowWallet],
        },
        {
          groupName: "More",
          wallets: [rabbyWallet, safeWallet],
        },
      ],
      ssr: true,
    });
  }
  return _config;
}

// For backward compat — only call in client context
export const config = typeof window !== "undefined" ? getWagmiConfig() : (null as unknown as Config);

declare module "wagmi" {
  interface Register {
    config: Config;
  }
}
