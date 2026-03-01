import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http } from "wagmi";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const config = getDefaultConfig({
  appName: "Cireta Launchpad",
  projectId: walletConnectProjectId,
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org"
    ),
    [baseSepolia.id]: http("https://sepolia.base.org"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
