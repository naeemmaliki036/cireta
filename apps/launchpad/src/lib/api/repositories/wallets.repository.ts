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
}

export interface LinkWalletRequest {
  address: string;
  signature: string;
  nonce: string;
  is_safe?: boolean;
  label?: string;
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

export async function unlinkWallet(address: string): Promise<void> {
  await apiFetch<void>(`/api/v1/wallets/${address}`, {
    method: "DELETE",
  });
}

export async function setPrimaryWallet(address: string): Promise<Wallet> {
  return apiFetch<Wallet>(`/api/v1/wallets/${address}/primary`, {
    method: "PATCH",
  });
}
