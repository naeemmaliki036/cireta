"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface User {
  id: string;
  email: string;
  role: "investor" | "issuer" | "admin";
  kycStatus: "none" | "pending" | "approved" | "rejected";
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
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        localStorage.removeItem("refreshToken");
        setState({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      const data = await res.json();
      localStorage.setItem("refreshToken", data.refresh_token);

      // Fetch user data
      const userRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });

      if (userRes.ok) {
        const user = await userRes.json();
        setState({
          user,
          accessToken: data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
      }
    } catch {
      setState({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail?.message ?? "Login failed");
    }

    const data = await res.json();
    localStorage.setItem("refreshToken", data.refresh_token);

    // Fetch user data
    const userRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    if (userRes.ok) {
      const user = await userRes.json();
      setState({
        user,
        accessToken: data.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken && state.accessToken) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore logout errors
      }
    }

    localStorage.removeItem("refreshToken");
    setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshAuth }}>
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
