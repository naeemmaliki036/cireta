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

interface User {
  id: string;
  email: string;
  display_name: string | null;
  role: "investor" | "issuer" | "admin";
  kycStatus: "none" | "pending" | "approved" | "rejected" | "expired";
  kycLevel: number;
}

interface AuthState {
  user: User | null;
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
    display_name: raw.display_name,
    role: raw.role,
    kycStatus: raw.kyc_status,
    kycLevel: raw.kyc_level,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshUser = useCallback(async () => {
    try {
      // Try fetching user directly (access token cookie may still be valid)
      const rawUser = await authRepo.me();
      setAuthCookie(true);
      setState({
        user: mapUser(rawUser),
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Access token expired — try refreshing
      try {
        await authRepo.refreshToken();
        const rawUser = await authRepo.me();
        setAuthCookie(true);
        setState({
          user: mapUser(rawUser),
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    // Calls /api/auth/login which sets httpOnly cookie server-side
    await authRepo.login({ email, password });
    // Fetch user profile via proxy (cookie now set)
    const rawUser = await authRepo.me();
    setAuthCookie(true);
    setState({
      user: mapUser(rawUser),
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const register = async (email: string, password: string) => {
    await authRepo.register({ email, password });
    const rawUser = await authRepo.me();
    setAuthCookie(true);
    setState({
      user: mapUser(rawUser),
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
    setAuthCookie(false);
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    window.location.href = "/login";
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
