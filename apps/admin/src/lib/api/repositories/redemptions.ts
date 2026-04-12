import { apiFetch } from "../client";

export interface Redemption {
  id: string;
  user_id: string;
  token_id: string;
  amount: string;
  status: string;
  fulfillment_method: string | null;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  fulfilled_at: string | null;
  tx_hash: string | null;
  created_at: string | null;
}

export interface RedemptionListResponse {
  redemptions: Redemption[];
}

export async function listRedemptions(): Promise<Redemption[]> {
  const data = await apiFetch<RedemptionListResponse>("/api/v1/admin/redemptions");
  return data.redemptions ?? [];
}

export async function updateRedemptionStatus(
  id: string,
  status: string,
  extra?: { tracking_number?: string; notes?: string },
): Promise<void> {
  await apiFetch(`/api/v1/admin/redemptions/${id}`, {
    method: "PATCH",
    body: { status, ...extra },
  });
}
