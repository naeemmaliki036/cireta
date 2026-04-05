import { apiGet, apiPost } from "../client";

export interface Holding {
  token_id: string;
  token_name: string;
  token_symbol: string;
  asset_type: string;
  balance: string;
  value_usd: string;
  claimable: string;
  /** On-chain token contract address (if deployed). */
  contract_address?: string | null;
}

export interface VestingSchedule {
  id: string;
  token_id: string;
  token_name: string;
  token_symbol: string;
  total_amount: string;
  claimed_amount: string;
  claimable_amount: string;
  cliff_end: string;
  vesting_end: string;
  last_claim_at: string | null;
  sale_mode: "direct" | "vested";
  vault_address: string | null;
  sale_contract_address: string | null;
}

export interface PortfolioSummary {
  holdings: Holding[];
  total_value_usd: string;
  total_invested_usd: string;
}

export interface RedemptionRequest {
  id: string;
  token_id: string;
  token_name: string;
  amount: string;
  fulfillment_method: "physical" | "cash";
  status: "pending" | "processing" | "fulfilled" | "cancelled";
  tx_hash: string;
  fulfilled_at: string | null;
  created_at: string;
}

export async function getPortfolio(): Promise<PortfolioSummary> {
  // /summary returns { holdings, total_value_usd, total_invested_usd }
  // /holdings returns flat list — we call /summary for the full shape
  try {
    const summary = await apiGet<PortfolioSummary>("/api/v1/portfolio/summary");
    return summary;
  } catch {
    // Fallback: call /holdings directly and build summary shape
    const items = await apiGet<Holding[]>("/api/v1/portfolio/holdings");
    const total = items.reduce((s, h) => s + parseFloat(h.value_usd || "0"), 0);
    return {
      holdings: items,
      total_value_usd: total.toString(),
      total_invested_usd: "0",
    };
  }
}

export async function getVesting(
  tokenId?: string
): Promise<VestingSchedule[]> {
  const path = tokenId
    ? `/api/v1/portfolio/vesting?token_id=${tokenId}`
    : "/api/v1/portfolio/vesting";
  return apiGet<VestingSchedule[]>(path);
}

export async function claimVesting(
  vestingId: string,
  txHash?: string
): Promise<{ claimed_amount: string; tx_hash: string }> {
  return apiPost(`/api/v1/portfolio/vesting/${vestingId}/claim`, {
    ...(txHash ? { tx_hash: txHash } : {}),
  });
}

export interface DividendEntry {
  token_symbol: string;
  token_name: string;
  claimable_usdc: string;
  total_earned: string;
  contract_address: string | null;
}

export interface Transaction {
  id: string;
  type: "investment" | "claim" | "redemption" | "refund";
  amount: string;
  tokens_allocated: string;
  token_symbol: string;
  token_name: string;
  token_id: string | null;
  tx_hash: string | null;
  status: string;
  created_at: string | null;
}

export interface TransactionFilters {
  token_id?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
}

export async function getDividends(): Promise<DividendEntry[]> {
  const data = await apiGet<{ dividends: DividendEntry[] }>("/api/v1/portfolio/dividends");
  return data.dividends ?? [];
}

export async function getTransactions(
  filters?: TransactionFilters
): Promise<TransactionListResponse> {
  const params = new URLSearchParams();
  if (filters?.token_id) params.set("token_id", filters.token_id);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  const path = `/api/v1/portfolio/transactions${qs ? `?${qs}` : ""}`;
  return apiGet<TransactionListResponse>(path);
}

export async function getRedemptions(): Promise<RedemptionRequest[]> {
  return apiGet<RedemptionRequest[]>("/api/v1/portfolio/redemptions");
}

export async function createRedemption(data: {
  token_id: string;
  amount: string;
  fulfillment_method: "physical" | "cash";
}): Promise<RedemptionRequest> {
  return apiPost<RedemptionRequest>("/api/v1/portfolio/redemptions", data);
}
