import { apiGet, apiPost } from "../client";

export interface Holding {
  token_id: string;
  token_name: string;
  token_symbol: string;
  asset_type: string;
  balance: string;
  value_usd: string;
  claimable: string;
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
  return apiGet<PortfolioSummary>("/api/v1/portfolio/holdings");
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
  vestingId: string
): Promise<{ claimed_amount: string; tx_hash: string }> {
  return apiPost(`/api/v1/portfolio/vesting/${vestingId}/claim`);
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
