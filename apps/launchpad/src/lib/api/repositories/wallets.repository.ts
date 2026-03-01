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
}

export interface LinkWalletRequest {
  address: string;
  signature: string;
  nonce: string;
  is_safe?: boolean;
  label?: string;
}

export async function listWallets(token: string): Promise<Wallet[]> {
  const res = await apiFetch<{ wallets: Wallet[]; total: number }>("/api/v1/wallets", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.wallets;
}

export async function linkWallet(token: string, data: LinkWalletRequest): Promise<Wallet> {
  return apiFetch<Wallet>("/api/v1/wallets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: data,
  });
}

export async function unlinkWallet(token: string, address: string): Promise<void> {
  await apiFetch<void>(`/api/v1/wallets/${address}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function setPrimaryWallet(token: string, address: string): Promise<Wallet> {
  return apiFetch<Wallet>(`/api/v1/wallets/${address}/primary`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}
