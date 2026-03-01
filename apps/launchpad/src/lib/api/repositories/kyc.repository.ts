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
