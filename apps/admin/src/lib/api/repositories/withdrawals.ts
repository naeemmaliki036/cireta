import { apiFetch } from "../client";

export interface WithdrawalSummary {
  available: string;
  pending: string;
  total_withdrawn: string;
}

export interface WithdrawalRecord {
  id: string;
  sale_id: string;
  sale_name: string | null;
  amount: string;
  token: string;
  status: string;
  tx_hash: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface WithdrawalListResponse {
  summary: WithdrawalSummary;
  items: WithdrawalRecord[];
  total: number;
}

export async function getWithdrawals(token: string): Promise<WithdrawalListResponse> {
  return apiFetch<WithdrawalListResponse>("/api/v1/issuer/withdrawals", { token });
}

export async function executeWithdrawal(
  saleId: string,
  amount: string,
  token: string,
): Promise<{ message: string; tx_hash: string | null }> {
  return apiFetch(`/api/v1/issuer/withdrawals/${saleId}/withdraw`, {
    method: "POST",
    body: { amount },
    token,
  });
}
