import { apiFetch } from "../client";

export interface Distribution {
  id: string;
  token_id: string;
  epoch_index: number;
  total_amount: string;
  created_at: string;
}

export interface DistributionListResponse {
  distributions: Distribution[];
}

export interface DepositDividendRequest {
  token_id: string;
  amount_usdc: number;
  contract_address?: string;
}

export async function listDistributions(): Promise<Distribution[]> {
  const data = await apiFetch<DistributionListResponse>("/api/v1/admin/dividends");
  return data.distributions ?? [];
}

export async function depositDividend(data: DepositDividendRequest): Promise<void> {
  await apiFetch("/api/v1/admin/dividends/deposit", {
    method: "POST",
    body: data,
  });
}
