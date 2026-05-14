import { apiFetch } from "../client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminWallet {
  id: string;
  address_checksum: string;
  chain_id: number;
  is_primary: boolean;
  is_safe: boolean;
  registered_on_chain: boolean;
  label: string | null;
  linked_at: string;
  user_email: string;
  user_display_name: string | null;
  user_country_code: string | null;
  user_kyc_status: string;
}

export interface AdminWalletStats {
  total_wallets: number;
  registered_on_chain: number;
  pending: number;
}

export type WalletStatusFilter = "all" | "registered" | "pending";

export interface AdminWalletListParams {
  page?: number;
  size?: number;
  search?: string;
  status?: WalletStatusFilter;
}

export interface AdminWalletListResponse {
  items: AdminWallet[];
  total: number;
  page: number;
  size: number;
  stats: AdminWalletStats;
}

export interface RefreshWalletStatusResponse {
  id: string;
  registered_on_chain: boolean;
}

// ── Repository functions ───────────────────────────────────────────────────────

export async function listAdminWallets(
  params: AdminWalletListParams = {},
): Promise<AdminWalletListResponse> {
  const { page = 1, size = 20, search, status } = params;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("size", String(size));
  if (search) qs.set("search", search);
  if (status && status !== "all") qs.set("status", status);
  return apiFetch<AdminWalletListResponse>(
    `/api/v1/admin/wallets?${qs.toString()}`,
  );
}

export async function refreshWalletStatus(
  walletId: string,
): Promise<RefreshWalletStatusResponse> {
  return apiFetch<RefreshWalletStatusResponse>(
    `/api/v1/admin/wallets/${walletId}/refresh-status`,
    { method: "POST" },
  );
}

export async function markWalletRegistered(
  walletId: string,
  txHash: string,
): Promise<AdminWallet> {
  return apiFetch<AdminWallet>(
    `/api/v1/admin/wallets/${walletId}/mark-registered`,
    { method: "POST", body: { tx_hash: txHash } },
  );
}
