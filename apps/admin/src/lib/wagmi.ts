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
import { http, fallback, createConfig, type Config } from "wagmi";
import { getChainId, getRpcUrl } from "@/lib/chain";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const chainId = getChainId();
const primaryRpcUrl = getRpcUrl();

// Public fallback RPCs so a single paid-provider rate-limit (e.g. Alchemy 429)
// doesn't silently freeze every wagmi read or transaction confirmation.
const BASE_SEPOLIA_FALLBACKS = [
  "https://base-sepolia.publicnode.com",
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
const BASE_MAINNET_FALLBACKS = [
  "https://base.publicnode.com",
  "https://mainnet.base.org",
];

function makeTransport(urls: string[]) {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  return fallback(unique.map((u) => http(u)));
}

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
        [base.id]: makeTransport([
          chainId === base.id ? primaryRpcUrl : "",
          ...BASE_MAINNET_FALLBACKS,
        ]),
        [baseSepolia.id]: makeTransport([
          chainId === baseSepolia.id ? primaryRpcUrl : "",
          ...BASE_SEPOLIA_FALLBACKS,
        ]),
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
