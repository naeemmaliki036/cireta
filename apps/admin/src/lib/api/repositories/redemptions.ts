import { apiFetch } from "../client";

export interface Redemption {
  id: string;
  user_id: string;
  user_email: string | null;
  user_wallet_address: string | null;
  token_id: string;
  token_symbol: string | null;
  token_name: string | null;
  token_contract_address: string | null;
  redemption_manager_address: string | null;
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
  /** RedemptionManager request id — null when the indexer hasn't synced yet. */
  onchain_id: number | null;
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
  extra?: { tracking_number?: string; notes?: string; tx_hash?: string },
): Promise<void> {
  await apiFetch(`/api/v1/admin/redemptions/${id}`, {
    method: "PATCH",
    body: { status, ...extra },
  });
}
