"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AuthProvider } from "@/contexts/AuthContext";
import { KYCProvider } from "@/contexts/KYCContext";

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
        <ClientProviders>{children}</ClientProviders>
      </KYCProvider>
    </AuthProvider>
  );
}
