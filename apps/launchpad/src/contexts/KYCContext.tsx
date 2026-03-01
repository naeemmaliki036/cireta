"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";

interface KYCStatus {
  status: "none" | "pending" | "approved" | "rejected";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
      const res = await fetch(`${API_BASE}/api/v1/kyc/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setKYCStatus({
          status: data.status,
          level: data.level,
          canInvest: data.level >= 2,
          message: data.message,
        });
      }
    } catch {
      // Keep current status on error
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  // Update KYC status when user changes
  if (user) {
    setKYCStatus({
      status: user.kycStatus,
      level: user.kycLevel,
      canInvest: user.kycLevel >= 2,
    });
  }

  const initiateKYC = async () => {
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/kyc/initiate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail?.message ?? "Failed to initiate KYC");
      }

      const data = await res.json();
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
