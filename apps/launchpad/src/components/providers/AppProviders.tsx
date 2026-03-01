"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ConnectKitProvider } from "connectkit";
import { config } from "@/lib/wagmi";
import { AuthProvider } from "@/contexts/AuthContext";
import { KYCProvider } from "@/contexts/KYCContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          options={{
            enforceSupportedChains: true,
            initialChainId: 8453, // Base
          }}
        >
          <AuthProvider>
            <KYCProvider>{children}</KYCProvider>
          </AuthProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
