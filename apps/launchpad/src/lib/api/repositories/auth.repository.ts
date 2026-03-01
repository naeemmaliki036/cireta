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
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  role: "investor" | "issuer" | "admin";
  kyc_status: "none" | "pending" | "approved" | "rejected";
  kyc_level: number;
  onchain_id: string | null;
  created_at: string;
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

export async function refreshToken(
  refreshTokenValue: string
): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/api/v1/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshTokenValue },
  });
}

export async function logout(
  accessToken: string,
  refreshTokenValue: string
): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", {
    method: "POST",
    token: accessToken,
    body: { refresh_token: refreshTokenValue },
  });
}
