"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AuthProvider } from "@/contexts/AuthContext";
import { KYCProvider } from "@/contexts/KYCContext";
import { WelcomeModal } from "@/components/organisms/WelcomeModal";

const ClientProviders = dynamic(
  () => import("./ClientProviders"),
  { ssr: false }
);

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AuthProvider>
      <KYCProvider>
        <ClientProviders>
          <WelcomeModal />
          {children}
        </ClientProviders>
      </KYCProvider>
    </AuthProvider>
  );
}
