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

export async function login(data: LoginRequest): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/api/v1/auth/login", {
    method: "POST",
    body: data,
  });
}

export async function register(data: RegisterRequest): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/api/v1/auth/register", {
    method: "POST",
    body: data,
  });
}

export async function me(token: string): Promise<User> {
  return apiFetch<User>("/api/v1/auth/me", { token });
}

export async function refreshToken(): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/api/v1/auth/refresh", {
    method: "POST",
    body: {},
  });
}

export async function logout(accessToken: string): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", {
    method: "POST",
    token: accessToken,
  });
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

export async function updateProfile(token: string, data: { display_name?: string }): Promise<User> {
  return apiFetch<User>("/api/v1/users/profile", {
    method: "PATCH",
    token,
    body: data,
  });
}
