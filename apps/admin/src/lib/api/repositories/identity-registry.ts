import { apiFetch } from "../client";

export interface IdentitySyncJob {
  id: string;
  user_id: string;
  user_email: string | null;
  wallet_id: string | null;
  action: "provision" | "add" | "remove";
  status: "pending" | "running" | "succeeded" | "failed";
  attempts: number;
  last_error: string | null;
  tx_hash: string | null;
  enqueued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface IdentitySyncJobListResponse {
  jobs: IdentitySyncJob[];
  total: number;
}

export type IdentitySyncJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "all";

export async function listIdentitySyncJobs(
  status: IdentitySyncJobStatus = "failed",
): Promise<IdentitySyncJobListResponse> {
  return apiFetch<IdentitySyncJobListResponse>(
    `/api/v1/admin/identity-registry/sync-jobs?status=${status}`,
  );
}

export async function retryIdentitySyncJob(id: string): Promise<IdentitySyncJob> {
  return apiFetch<IdentitySyncJob>(
    `/api/v1/admin/identity-registry/sync-jobs/${id}/retry`,
    { method: "POST" },
  );
}

export interface EmergencyManualSyncBody {
  wallet_address: string;
  action: "add" | "remove";
  tx_hash: string;
}

export async function recordEmergencyManualSync(
  body: EmergencyManualSyncBody,
): Promise<{
  status: string;
  wallet_address: string;
  action: string;
  tx_hash: string;
  wallet_row_updated: boolean;
}> {
  return apiFetch(`/api/v1/admin/identity-registry/emergency-manual-sync`, {
    method: "POST",
    body,
  });
}
