import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  rainbowWallet,
  rabbyWallet,
  safeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { base, baseSepolia } from "wagmi/chains";
import { http, createConfig, type Config } from "wagmi";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "placeholder";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://base-sepolia-rpc.publicnode.com";

const chains =
  chainId === 84532 ? ([baseSepolia, base] as const) : ([base, baseSepolia] as const);

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, safeWallet],
    },
    {
      groupName: "More",
      wallets: [rainbowWallet, rabbyWallet],
    },
  ],
  {
    appName: "Cireta Launchpad",
    projectId: walletConnectProjectId,
  },
);

let _config: Config | null = null;

export function getWagmiConfig(): Config {
  if (!_config) {
    _config = createConfig({
      connectors,
      chains,
      transports: {
        [base.id]: http(rpcUrl),
        [baseSepolia.id]: http(rpcUrl),
      },
      multiInjectedProviderDiscovery: true,
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
