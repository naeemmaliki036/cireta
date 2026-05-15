import { apiFetch } from "../client";

export type RedemptionType = "none" | "manual_off_chain" | "on_chain";

export interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  /** Maximum supply cap — null for legacy tokens without the field */
  max_supply: string | null;
  /** Whether the token can be minted beyond the initial amount */
  mintable: boolean;
  /** Current circulating supply — null if not yet synced from chain */
  current_supply: string | null;
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
  // Round-6: redemption metadata
  redemption_type: RedemptionType | null;
  redemption_url: string | null;
  redemption_description: string | null;
  redemption_manager_address: string | null;
  /** Comma-separated subset of "cash,physical" — defaults to both. */
  redemption_allowed_methods?: string | null;
  /** Minimum token amount per redemption — null = no minimum. */
  redemption_min_amount?: string | null;
}

export interface TokenRedemptionRequest {
  redemption_type?: RedemptionType;
  redemption_url?: string | null;
  redemption_description?: string | null;
  redemption_manager_address?: string | null;
  redemption_allowed_methods?: string | null;
  redemption_min_amount?: number | null;
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
  let url = `/api/v1/tokens?page=${page}&size=${size}`;
  if (issuerId) url += `&issuer_id=${issuerId}`;
  return apiFetch<TokenListResponse>(url, { token });
}

export async function getToken(id: string, token?: string): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${id}`, { token });
}

export interface TokenCreateRequest {
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  /** Maximum supply cap (= total_supply for fixed; can be higher for mintable) */
  max_supply?: string;
  /** Whether the token allows additional minting after deploy */
  mintable?: boolean;
  decimals?: string;
  description?: string;
  // Round-6: redemption metadata
  redemption_type?: RedemptionType;
  redemption_url?: string | null;
  redemption_description?: string | null;
  redemption_manager_address?: string | null;
}

export async function createToken(
  data: TokenCreateRequest,
  token?: string,
): Promise<Token> {
  return apiFetch<Token>("/api/v1/tokens", {
    method: "POST",
    body: {
      ...data,
      total_supply: data.total_supply,
      max_supply: data.max_supply,
      mintable: data.mintable ?? true,
      decimals: parseInt(data.decimals ?? "6", 10),
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
    max_supply?: string;
    mintable?: boolean;
    current_supply?: string;
  },
): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${tokenId}/record-deployment`, {
    method: "POST",
    body: data,
  });
}

/**
 * PATCH /v1/tokens/{token_id}/redemption
 * Updates the redemption metadata fields for a token.
 */
export async function updateTokenRedemption(
  tokenId: string,
  data: TokenRedemptionRequest,
): Promise<Token> {
  return apiFetch<Token>(`/api/v1/tokens/${tokenId}/redemption`, {
    method: "PATCH",
    body: data,
  });
}
