import { apiFetch } from "../client";

export interface SalePhase {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  sold: string;
  start_time: string;
  end_time: string;
}

export interface Sale {
  id: string;
  token_id: string;
  issuer_id: string;
  payment_token: string;
  soft_cap: string;
  hard_cap: string;
  total_raised: string;
  status: string;
  phases: SalePhase[];
  token_name: string | null;
  token_symbol: string | null;
  created_at: string;
}

export interface SaleListResponse {
  items: Sale[];
  total: number;
}

export async function getSales(
  page = 1,
  size = 20,
  token?: string,
): Promise<SaleListResponse> {
  return apiFetch<SaleListResponse>(
    `/api/v1/sales/?page=${page}&size=${size}`,
    { token },
  );
}

export async function getSale(id: string, token?: string): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${id}`, { token });
}
