import { apiFetch } from "../client";

export interface PaymentToken {
  id: string;
  address: string;
  symbol: string;
  name: string;
  chain_id: number;
  decimals: number;
  sort_order: number;
  is_active: boolean;
}

export async function getPaymentTokens(chainId?: number): Promise<PaymentToken[]> {
  const qs = chainId ? `?chain_id=${chainId}` : "";
  const data = await apiFetch<{ items: PaymentToken[] }>(`/api/v1/payment-tokens${qs}`);
  return data.items;
}
