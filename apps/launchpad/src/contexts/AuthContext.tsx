"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import * as authRepo from "@/lib/api/repositories/auth.repository";
import { setAccessToken } from "@/lib/api/client";

interface User {
  id: string;
  email: string;
  role: "investor" | "issuer" | "admin";
  kycStatus: "none" | "pending" | "approved" | "rejected" | "expired";
  kycLevel: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function setAuthCookie(authenticated: boolean) {
  if (authenticated) {
    document.cookie = "cireta_auth=1; path=/; SameSite=Lax";
  } else {
    document.cookie = "cireta_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

function mapUser(raw: authRepo.User): User {
  return {
    id: raw.id,
    email: raw.email,
    role: raw.role,
    kycStatus: raw.kyc_status,
    kycLevel: raw.kyc_level,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshUser = useCallback(async () => {
    try {
      // Try refreshing via httpOnly cookie (auto-sent with credentials: "include")
      const tokens = await authRepo.refreshToken();
      setAccessToken(tokens.access_token);
      const rawUser = await authRepo.me();
      setAuthCookie(true);
      setState({
        user: mapUser(rawUser),
        accessToken: tokens.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // No valid refresh cookie — user is not authenticated
      setAccessToken(null);
      setAuthCookie(false);
      setState({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const tokens = await authRepo.login({ email, password });
    setAccessToken(tokens.access_token);
    const rawUser = await authRepo.me();
    setAuthCookie(true);
    setState({
      user: mapUser(rawUser),
      accessToken: tokens.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const register = async (email: string, password: string) => {
    const tokens = await authRepo.register({ email, password });
    setAccessToken(tokens.access_token);
    const rawUser = await authRepo.me();
    setAuthCookie(true);
    setState({
      user: mapUser(rawUser),
      accessToken: tokens.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const logout = async () => {
    try {
      await authRepo.logout();
    } catch {
      // Ignore logout errors
    }

    setAccessToken(null);
    setAuthCookie(false);
    setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
