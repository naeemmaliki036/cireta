"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useDisconnect } from "wagmi";
import { RainbowKitProvider, lightTheme, type AvatarComponent } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { getWagmiConfig } from "@/lib/wagmi";
import { Web3Provider } from "@/contexts/Web3Context";
import { useAuth } from "@/contexts/AuthContext";

const NoAvatar: AvatarComponent = () => <div style={{ display: "none" }} />;

/**
 * Disconnect any wagmi-connected wallet whenever the user is not
 * authenticated. Covers two cases:
 *   1. User signs out → wallet disconnects with them.
 *   2. A guest had a persisted wallet connection from before we gated
 *      wallet-connect behind sign-in; on next load wagmi auto-reconnects,
 *      and this effect tears it down so the Navbar doesn't show a live
 *      wallet chip for a signed-out visitor.
 * Only runs once auth has finished loading, to avoid a flash of
 * disconnect during the initial user fetch.
 */
function AuthWagmiBridge() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && isConnected) disconnect();
  }, [isAuthenticated, isLoading, isConnected, disconnect]);
  return null;
}

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
          avatar={NoAvatar}
          initialChain={8453}
          modalSize="compact"
        >
          <Web3Provider>
            <AuthWagmiBridge />
            {children}
          </Web3Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
