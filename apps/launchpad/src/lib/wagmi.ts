import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http, type Config } from "wagmi";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder";

if (walletConnectProjectId === "placeholder") {
  console.error(
    "WalletConnect project ID not configured — wallet connection will fail. " +
      "Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment."
  );
}

let _config: Config | null = null;

// Default to Base Sepolia first for testnet phase
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const chains =
  chainId === 84532 ? ([baseSepolia, base] as const) : ([base, baseSepolia] as const);

export function getWagmiConfig(): Config {
  if (!_config) {
    _config = getDefaultConfig({
      appName: "Cireta Launchpad",
      projectId: walletConnectProjectId,
      chains,
      transports: {
        [base.id]: http(
          process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org"
        ),
        [baseSepolia.id]: http("https://sepolia.base.org"),
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
