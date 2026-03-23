"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "@/lib/api/client";

interface KYCStatus {
  status: "none" | "pending" | "approved" | "rejected" | "expired";
  level: number;
  canInvest: boolean;
  message?: string;
}

interface KYCContextValue {
  kycStatus: KYCStatus;
  isLoading: boolean;
  initiateKYC: () => Promise<string>;
  refreshStatus: () => Promise<void>;
}

const KYCContext = createContext<KYCContextValue | null>(null);

export function KYCProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKYCStatus] = useState<KYCStatus>({
    status: "none",
    level: 0,
    canInvest: false,
  });

  const refreshStatus = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const data = await apiFetch<{ status: string; level: number; message?: string }>(
        "/api/v1/kyc/status",
        { token: accessToken },
      );
      setKYCStatus({
        status: data.status as KYCStatus["status"],
        level: data.level,
        canInvest: data.level >= 2,
        message: data.message,
      });
    } catch {
      // Keep current status on error
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  // Update KYC status when user changes
  useEffect(() => {
    if (user) {
      setKYCStatus({
        status: user.kycStatus,
        level: user.kycLevel,
        canInvest: user.kycLevel >= 2,
      });
    }
  }, [user]);

  const initiateKYC = async () => {
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    setIsLoading(true);
    try {
      const data = await apiFetch<{ verification_url: string }>(
        "/api/v1/kyc/initiate",
        { method: "POST", token: accessToken },
      );
      return data.verification_url;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KYCContext.Provider
      value={{ kycStatus, isLoading, initiateKYC, refreshStatus }}
    >
      {children}
    </KYCContext.Provider>
  );
}

export function useKYC() {
  const context = useContext(KYCContext);
  if (!context) {
    throw new Error("useKYC must be used within KYCProvider");
  }
  return context;
}
