import { apiFetch } from "../client";

export interface KYCInitiateResponse {
  applicant_id: string;
  access_token: string;
  expiration: string;
}

export interface KYCStatusResponse {
  status: "none" | "pending" | "approved" | "rejected";
  level: number;
  review_status: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export async function initiateKYC(token: string): Promise<KYCInitiateResponse> {
  return apiFetch<KYCInitiateResponse>("/api/v1/kyc/initiate", {
    method: "POST",
    token,
  });
}

export async function getKYCStatus(token: string): Promise<KYCStatusResponse> {
  return apiFetch<KYCStatusResponse>("/api/v1/kyc/status", { token });
}

export interface KYBDocumentRequest {
  company_name: string;
  registration_number: string;
  jurisdiction: string;
  directors: Array<Record<string, string>>;
  ubo_list: Array<Record<string, string>>;
}

export interface KYBStatusResponse {
  status: string;
  level: number;
  company_name: string | null;
  review_status: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export async function initiateCorporateKYB(
  token: string,
  data: KYBDocumentRequest
): Promise<KYCInitiateResponse> {
  return apiFetch<KYCInitiateResponse>("/api/v1/kyc/corporate/initiate", {
    method: "POST",
    token,
    body: data,
  });
}

export async function getCorporateKYBStatus(
  token: string
): Promise<KYBStatusResponse> {
  return apiFetch<KYBStatusResponse>("/api/v1/kyc/corporate/status", { token });
}
