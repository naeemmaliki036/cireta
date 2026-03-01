"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { config } from "@/lib/wagmi";
import { AuthProvider } from "@/contexts/AuthContext";
import { KYCProvider } from "@/contexts/KYCContext";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#13636F",
            accentColorForeground: "white",
            borderRadius: "large",
            fontStack: "system",
          })}
          initialChain={8453}
        >
          <AuthProvider>
            <KYCProvider>
              {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
            </KYCProvider>
          </AuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
