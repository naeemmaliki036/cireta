import { apiFetch } from "../client";

export interface Holding {
  token_id: string;
  token_name: string;
  token_symbol: string;
  amount: string;
  status: string;
}

export interface PortfolioSummary {
  total_holdings: number;
  total_value_usd: string;
  holdings: Holding[];
}

export async function getPortfolioSummary(
  userId: string,
  token: string,
): Promise<PortfolioSummary> {
  return apiFetch<PortfolioSummary>(`/api/v1/portfolio/${userId}/summary`, {
    token,
  });
}
