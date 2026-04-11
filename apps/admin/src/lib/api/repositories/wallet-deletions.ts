import { apiFetch } from "../client";

export interface WalletDeletionRequest {
  id: string;
  user_id: string;
  user_email: string;
  wallet_id: string;
  wallet_address: string;
  reason: string | null;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
}

export interface WalletDeletionRequestListResponse {
  requests: WalletDeletionRequest[];
  total: number;
}

export type WalletDeletionStatus = "pending" | "approved" | "denied" | "all";

export async function listWalletDeletionRequests(
  status: WalletDeletionStatus = "pending",
): Promise<WalletDeletionRequestListResponse> {
  return apiFetch<WalletDeletionRequestListResponse>(
    `/api/v1/admin/wallet-deletion-requests?status=${status}`,
  );
}

export async function approveWalletDeletionRequest(
  id: string,
  notes?: string,
): Promise<WalletDeletionRequest> {
  return apiFetch<WalletDeletionRequest>(
    `/api/v1/admin/wallet-deletion-requests/${id}/approve`,
    {
      method: "POST",
      body: { notes: notes ?? null },
    },
  );
}

export async function denyWalletDeletionRequest(
  id: string,
  notes?: string,
): Promise<WalletDeletionRequest> {
  return apiFetch<WalletDeletionRequest>(
    `/api/v1/admin/wallet-deletion-requests/${id}/deny`,
    {
      method: "POST",
      body: { notes: notes ?? null },
    },
  );
}
