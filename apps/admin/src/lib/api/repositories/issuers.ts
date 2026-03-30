import { apiFetch } from "../client";

export interface Issuer {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  legal_entity_name: string | null;
  jurisdiction: string | null;
  wallet_address: string | null;
  status: "pending" | "active" | "suspended";
  issuer_type: "individual" | "corporate";
  wallet_status: "none" | "pending_approval" | "approved" | "rejected";
  identity_status: "none" | "pending" | "approved" | "rejected";
  identity_verified_at: string | null;
  fee_bps: number;
  created_at: string;
}

export interface IssuerListResponse {
  items: Issuer[];
  total: number;
}

export interface CreateIssuerRequest {
  user_id: string;
  name: string;
  slug: string;
  legal_entity_name?: string;
  jurisdiction?: string;
  wallet_address?: string;
}

export async function getIssuers(
  page = 1,
  size = 20,
  token?: string,
): Promise<IssuerListResponse> {
  return apiFetch<IssuerListResponse>(
    `/api/v1/admin/issuers/?page=${page}&size=${size}`,
    { token },
  );
}

export async function getIssuer(
  id: string,
  token?: string,
): Promise<Issuer> {
  return apiFetch<Issuer>(`/api/v1/admin/issuers/${id}`, { token });
}

export async function createIssuer(
  data: CreateIssuerRequest,
  token: string,
): Promise<Issuer> {
  return apiFetch<Issuer>("/api/v1/admin/issuers/", {
    method: "POST",
    body: data,
    token,
  });
}

export async function updateIssuerFee(
  issuerId: string,
  feeBps: number,
  token: string,
): Promise<Issuer> {
  return apiFetch<Issuer>(`/api/v1/admin/issuers/${issuerId}/fee`, {
    method: "PATCH",
    body: { fee_bps: feeBps },
    token,
  });
}

export async function revokeIssuer(
  issuerId: string,
  token: string,
): Promise<Issuer> {
  return apiFetch<Issuer>(`/api/v1/admin/issuers/${issuerId}/revoke`, {
    method: "POST",
    token,
  });
}

export async function activateIssuer(
  issuerId: string,
  token: string,
): Promise<Issuer> {
  return apiFetch<Issuer>(`/api/v1/admin/issuers/${issuerId}/activate`, {
    method: "POST",
    token,
  });
}
