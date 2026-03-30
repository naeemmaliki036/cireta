import { apiFetch } from "../client";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  role: "investor" | "issuer" | "admin";
  kyc_status: "none" | "pending" | "approved" | "rejected" | "expired";
  kyc_level: number;
  display_name: string | null;
  email_verified: boolean;
  country_code: string | null;
  investor_type: string;
  onchain_id?: string | null;
  created_at?: string;
}

/**
 * Auth functions call Next.js API routes (not the proxy) because
 * these routes set/clear httpOnly cookies server-side.
 */

export async function login(data: LoginRequest): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail?.message ?? error.detail ?? "Login failed");
  }
  return res.json();
}

export async function register(data: RegisterRequest): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail?.message ?? error.detail ?? "Registration failed");
  }
  return res.json();
}

export async function refreshToken(): Promise<{ success: boolean }> {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  if (!res.ok) throw new Error("Refresh failed");
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

/** These go through the proxy (cookie attached server-side) */

export async function me(): Promise<User> {
  return apiFetch<User>("/api/v1/auth/me");
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/v1/auth/reset-password", {
    method: "POST",
    body: { token, new_password },
  });
}

export async function updateProfile(data: { display_name?: string }): Promise<User> {
  return apiFetch<User>("/api/v1/users/profile", {
    method: "PATCH",
    body: data,
  });
}
