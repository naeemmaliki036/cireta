import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const config = createConfig(
  getDefaultConfig({
    chains: [base, baseSepolia],
    transports: {
      [base.id]: http(
        process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org"
      ),
      [baseSepolia.id]: http("https://sepolia.base.org"),
    },
    walletConnectProjectId,
    appName: "Cireta Launchpad",
    appDescription: "Invest in tokenized real-world assets",
    appUrl: "https://launchpad.cireta.com",
    appIcon: "https://launchpad.cireta.com/logo.png",
  })
);

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
