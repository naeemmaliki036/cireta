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
import { getChainId, getRpcUrl } from "@/lib/chain";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const chainId = getChainId();
const rpcUrl = getRpcUrl();

const chains =
  chainId === baseSepolia.id
    ? ([baseSepolia, base] as const)
    : ([base, baseSepolia] as const);

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
    appName: "Cireta Admin Portal",
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
        [base.id]: http(chainId === base.id ? rpcUrl : undefined),
        [baseSepolia.id]: http(chainId === baseSepolia.id ? rpcUrl : undefined),
      },
      multiInjectedProviderDiscovery: true,
      ssr: true,
    });
  }
  return _config;
}

declare module "wagmi" {
  interface Register {
    config: Config;
  }
}
