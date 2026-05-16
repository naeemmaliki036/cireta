import { apiGet, apiPost } from "../client";

export interface Holding {
  token_id: string;
  token_name: string;
  token_symbol: string;
  asset_type: string;
  balance: string;
  value_usd: string;
  claimable: string;
  claimable_amount?: string;
  vested_amount?: string;
  /** On-chain token contract address (if deployed). */
  contract_address?: string | null;
  /**
   * True when the holding represents soul-bound fraction tokens still in
   * vesting. Locked holdings can't be transferred and are rendered in a
   * separate "Locked / Vesting" section.
   */
  locked?: boolean;
  /** Whether the investor can redeem tokens from this sale. */
  is_redeemable?: boolean;
  /** "none" | "manual_off_chain" | "on_chain". Drives whether the Redeem
   *  button opens RedemptionRequestModal or links to issuer instructions. */
  redemption_type?: "none" | "manual_off_chain" | "on_chain" | null;
  /** Deployed RedemptionManager — required to sign requestRedemption. */
  redemption_manager_address?: string | null;
  /** Sale mode — "vested" means holder has fraction tokens, "direct" means project tokens. */
  sale_mode?: "direct" | "vested";
  /** Per-source balance breakdown (vested mode only). Optional; backend may not populate. */
  balance_usdc?: string;
  balance_otc?: string;
  /** Vesting timeline (vested holdings only). 0..1 progress between cliff and full unlock. */
  vesting_progress?: number;
  cliff_end?: string | null;
  vesting_end?: string | null;
  /** Earliest upcoming unlock — cliff_end if not yet passed, vesting_end otherwise. */
  next_unlock_at?: string | null;
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
  /** Address of the ERC-1155 fraction token contract (vested sales only). */
  fraction_token_address?: string | null;
}

export interface PortfolioSummary {
  holdings: Holding[];
  total_value_usd: string;
  total_invested_usd: string;
}

export interface RedemptionRequest {
  id: string;
  token_id: string;
  token_symbol: string;
  token_name: string | null;
  token_contract_address: string | null;
  redemption_manager_address: string | null;
  /** RedemptionManager request id — null until the indexer syncs it. */
  onchain_id: number | null;
  amount: string;
  fulfillment_method: "physical" | "cash";
  status: "pending" | "processing" | "shipped" | "fulfilled" | "cancelled";
  /** On-chain burn tx hash, set when the issuer signs fulfil(id). */
  tx_hash: string | null;
  fulfilled_at: string | null;
  notes: string | null;
  rejection_reason: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  shipping_country_mismatch: boolean;
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
  is_otc?: boolean;
  created_at: string | null;
  phase_name?: string | null;
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

export async function cancelRedemption(requestId: string): Promise<RedemptionRequest> {
  return apiPost<RedemptionRequest>(`/api/v1/portfolio/redemptions/${requestId}/cancel`, {});
}
