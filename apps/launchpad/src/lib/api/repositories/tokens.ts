import { apiGet } from "../client";

export interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: "commodity" | "futures";
  contract_address: string | null;
  total_supply: string;
  decimals: number;
  ipfs_docs_hash: string | null;
  chainlink_por_feed: string | null;
  is_paused: boolean;
  created_at: string;
  issuer: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface TokenListResponse {
  items: Token[];
  total: number;
  page: number;
  size: number;
}

export async function getTokens(
  page = 1,
  size = 20
): Promise<TokenListResponse> {
  return apiGet<TokenListResponse>(
    `/api/v1/tokens/?page=${page}&size=${size}`
  );
}

export async function getToken(id: string): Promise<Token> {
  return apiGet<Token>(`/api/v1/tokens/${id}`);
}
