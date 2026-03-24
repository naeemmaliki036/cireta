import { apiGet, apiPost } from "../client";

export interface SalePhase {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  sold: string;
  min_contribution: string;
  max_contribution: string;
  start_time: string;
  end_time: string;
  whitelist_only: boolean;
}

export interface Sale {
  id: string;
  token_id: string;
  token: {
    id: string;
    name: string;
    symbol: string;
    asset_type: string;
  };
  issuer: {
    id: string;
    name: string;
    slug: string;
  };
  payment_token: string;
  soft_cap: string;
  hard_cap: string;
  total_raised: string;
  status: "draft" | "active" | "paused" | "finalized" | "failed";
  phases: SalePhase[];
  created_at: string;
}

export interface SaleListResponse {
  items: Sale[];
  total: number;
  page: number;
  size: number;
}

export interface ContributionRequest {
  phase_id: string;
  amount: string;
  tx_hash?: string;
}

export interface ContributionResponse {
  contribution_id: string;
  amount: string;
  tokens_allocated: string;
  tx_hash: string | null;
}

export async function getSales(
  page = 1,
  size = 20,
  status?: string
): Promise<SaleListResponse> {
  let url = `/api/v1/sales/?page=${page}&size=${size}`;
  if (status) {
    url += `&status=${status}`;
  }
  return apiGet<SaleListResponse>(url);
}

export async function getSale(id: string): Promise<Sale> {
  return apiGet<Sale>(`/api/v1/sales/${id}`);
}

export async function contribute(
  saleId: string,
  data: ContributionRequest,
  token: string
): Promise<ContributionResponse> {
  return apiPost<ContributionResponse, ContributionRequest>(
    `/api/v1/sales/${saleId}/contribute`,
    data,
    { token }
  );
}

export async function claimTokens(
  saleId: string,
  token: string
): Promise<{ claimed_amount: string; tx_hash: string }> {
  return apiPost(`/api/v1/sales/${saleId}/claim`, undefined, { token });
}

export async function claimRefund(
  saleId: string,
  token: string
): Promise<{ refunded_amount: string; tx_hash: string }> {
  return apiPost(`/api/v1/sales/${saleId}/refund`, undefined, { token });
}
