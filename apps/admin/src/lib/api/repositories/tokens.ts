import { apiFetch } from "../client";

export interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  contract_address: string | null;
  is_paused: boolean;
  issuer_id: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface TokenListResponse {
  items: Token[];
  total: number;
  page: number;
  size: number;
}

export async function getTokens(
  page = 1,
  size = 20,
  issuerId?: string,
  token?: string,
): Promise<TokenListResponse> {
  let url = `/api/v1/tokens/?page=${page}&size=${size}`;
  if (issuerId) url += `&issuer_id=${issuerId}`;
  return apiFetch<TokenListResponse>(url, { token });
}

export async function getToken(id: string, token?: string): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${id}`, { token });
}
