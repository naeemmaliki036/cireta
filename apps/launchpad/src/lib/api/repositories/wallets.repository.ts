import { apiFetch } from "../client";

export interface Wallet {
  id: string;
  address: string;
  chain_id: number;
  is_primary: boolean;
  is_safe: boolean;
  registered_on_chain: boolean;
  label: string | null;
  linked_at: string;
  screening_status?: string | null;
  /** True when there's a pending WalletDeletionRequest in admin review. */
  has_pending_deletion_request?: boolean;
  /** True when ANY Contribution row references this wallet — non-deletable. */
  has_contributions?: boolean;
}

export interface LinkWalletRequest {
  address: string;
  signature: string;
  nonce: string;
  is_safe?: boolean;
  label?: string;
}

export interface UnlinkWalletResponse {
  /** "deleted" → fast path (unverified user); "deletion_requested" → admin review. */
  status: "deleted" | "deletion_requested";
  request_id?: string;
  message?: string;
}

export interface DeletionRequestResponse {
  status: "deletion_requested";
  request_id: string;
  message: string;
}

export async function listWallets(): Promise<Wallet[]> {
  const res = await apiFetch<{ wallets: Wallet[]; total: number }>("/api/v1/wallets");
  return res.wallets;
}

export async function linkWallet(data: LinkWalletRequest): Promise<Wallet> {
  return apiFetch<Wallet>("/api/v1/wallets", {
    method: "POST",
    body: data,
  });
}

export async function unlinkWallet(address: string): Promise<UnlinkWalletResponse> {
  return apiFetch<UnlinkWalletResponse>(`/api/v1/wallets/${address}`, {
    method: "DELETE",
  });
}

export async function requestWalletDeletion(
  address: string,
  reason?: string,
): Promise<DeletionRequestResponse> {
  return apiFetch<DeletionRequestResponse>(
    `/api/v1/wallets/${address}/deletion-request`,
    {
      method: "POST",
      body: { reason: reason ?? null },
    },
  );
}

export async function renameWallet(address: string, label: string): Promise<Wallet> {
  return apiFetch<Wallet>(`/api/v1/wallets/${address}`, {
    method: "PATCH",
    body: { label },
  });
}

export async function setPrimaryWallet(address: string): Promise<Wallet> {
  return apiFetch<Wallet>(`/api/v1/wallets/${address}/primary`, {
    method: "PATCH",
  });
}
