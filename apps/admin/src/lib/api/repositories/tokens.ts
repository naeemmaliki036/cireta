import { apiFetch } from "../client";

export interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  contract_address: string | null;
  identity_registry_address: string | null;
  compliance_address: string | null;
  decimals: number;
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

export async function createToken(
  data: {
    name: string;
    symbol: string;
    asset_type: string;
    total_supply: string;
    decimals?: string;
    description?: string;
  },
  token?: string,
): Promise<Token> {
  return apiFetch<Token>("/api/v1/tokens/", {
    method: "POST",
    body: {
      ...data,
      total_supply: data.total_supply,
      decimals: parseInt(data.decimals ?? "18", 10),
    },
    token,
  });
}

export async function deployToken(
  tokenId: string,
  accessToken?: string,
): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${tokenId}/deploy`, {
    method: "POST",
    token: accessToken,
  });
}

/**
 * Record on-chain deployment addresses after the issuer deploys via wallet.
 */
export async function recordTokenDeployment(
  tokenId: string,
  data: {
    contract_address: string;
    identity_registry_address: string;
    compliance_address: string;
    tx_hash: string;
  },
): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${tokenId}/record-deployment`, {
    method: "POST",
    body: data,
  });
}
