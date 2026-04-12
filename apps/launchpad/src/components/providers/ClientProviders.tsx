"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme, type AvatarComponent } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { getWagmiConfig } from "@/lib/wagmi";
import { Web3Provider } from "@/contexts/Web3Context";

const CiretaAvatar: AvatarComponent = ({ address, size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #13636F 0%, #1D7377 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontSize: size * 0.35,
      fontWeight: 700,
      letterSpacing: "0.02em",
    }}
  >
    {address ? `${address.slice(2, 4).toUpperCase()}` : "??"}
  </div>
);

interface Props {
  children: ReactNode;
}

export default function ClientProviders({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: false, refetchOnWindowFocus: false },
        },
      })
  );

  const wagmiConfig = getWagmiConfig();

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#13636F",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
          avatar={CiretaAvatar}
          initialChain={8453}
          modalSize="compact"
        >
          <Web3Provider>
            {children}
          </Web3Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
