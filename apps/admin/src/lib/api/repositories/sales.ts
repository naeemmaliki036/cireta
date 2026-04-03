import { apiFetch } from "../client";

export interface SalePhase {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  sold: string;
  start_time: string;
  end_time: string;
  whitelist_only?: boolean;
}

export interface Sale {
  id: string;
  token_id: string | null;
  issuer_id: string;
  payment_token: string;
  soft_cap: string;
  hard_cap: string;
  total_raised: string;
  status: string;
  sale_mode: string;
  sale_structure: string;
  is_coming_soon: boolean;
  otc_enabled: boolean;
  otc_content: string | null;
  otc_token_address: string | null;
  title: string | null;
  description_text: string | null;
  full_description: string | null;
  banner_image_url: string | null;
  website_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  telegram_url: string | null;
  discord_url: string | null;
  contract_address: string | null;
  token_contract_address: string | null;
  identity_registry_address: string | null;
  phases: SalePhase[];
  token_name: string | null;
  token_symbol: string | null;
  issuer_name: string | null;
  created_at: string;
}

export interface SaleListResponse {
  items: Sale[];
  total: number;
}

export async function getSales(
  page = 1,
  size = 20,
  token?: string,
): Promise<SaleListResponse> {
  return apiFetch<SaleListResponse>(
    `/api/v1/sales/?page=${page}&size=${size}`,
    { token },
  );
}

export async function getAdminSales(
  page = 1,
  size = 20,
): Promise<SaleListResponse> {
  return apiFetch<SaleListResponse>(
    `/api/v1/admin/sales/?page=${page}&size=${size}`,
  );
}

export async function getIssuerSales(
  page = 1,
  size = 20,
): Promise<SaleListResponse> {
  return apiFetch<SaleListResponse>(
    `/api/v1/issuer/sales?page=${page}&size=${size}`,
  );
}

export async function getSale(id: string, token?: string): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${id}`, { token });
}

export interface CreateSaleRequest {
  title?: string;
  description?: string;
  full_description?: string;
  banner_image_url?: string;
  is_coming_soon?: boolean;
  otc_enabled?: boolean;
  otc_content?: string;
  otc_token_address?: string;
  sale_mode?: string;
  sale_structure?: string;
  cliff_duration_days?: number;
  vesting_duration_days?: number;
  token_id?: string;
  payment_token?: string;
  soft_cap?: string;
  hard_cap?: string;
  phases?: {
    name: string;
    allocation: number;
    price_per_token: string;
    start_time: string;
    end_time: string;
  }[];
}

export async function createSale(
  data: CreateSaleRequest,
  token?: string,
): Promise<Sale> {
  return apiFetch<Sale>("/api/v1/sales", {
    method: "POST",
    body: data,
    token,
  });
}

export async function deploySale(
  saleId: string,
  token?: string,
): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${saleId}/deploy`, {
    method: "POST",
    body: {},
    token,
  });
}

/**
 * Record on-chain sale deployment address after the issuer deploys via wallet.
 */
export async function recordSaleDeployment(
  saleId: string,
  data: {
    contract_address: string;
    tx_hash: string;
  },
): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${saleId}/record-deployment`, {
    method: "POST",
    body: data,
  });
}

export async function submitSaleForApproval(
  saleId: string,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/submit-for-approval`, {
    method: "POST",
    body: {},
    token,
  });
}

export interface TeamMemberData {
  name: string;
  title: string;
  bio: string;
  photo_url: string;
}

export async function addSaleTeamMember(
  saleId: string,
  data: TeamMemberData,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/team`, {
    method: "POST",
    body: data,
    token,
  });
}

export interface FAQData {
  question: string;
  answer: string;
}

export async function addSaleFAQ(
  saleId: string,
  data: FAQData,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/faqs`, {
    method: "POST",
    body: data,
    token,
  });
}

export interface DocumentData {
  name: string;
  type: string;
  url: string;
}

export async function addSaleDocument(
  saleId: string,
  data: DocumentData,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/documents`, {
    method: "POST",
    body: data,
    token,
  });
}

export interface ImageData {
  url: string;
  caption?: string;
  is_banner?: boolean;
  sort_order?: number;
  media_type?: "image" | "video";
  video_url?: string;
}

export async function addSaleImage(
  saleId: string,
  data: ImageData,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/images`, {
    method: "POST",
    body: data,
    token,
  });
}

export async function removeSaleImage(
  saleId: string,
  imageId: string,
  token?: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/images/${imageId}`, {
    method: "DELETE",
    token,
  });
}

export interface UpdateSaleRequest {
  title?: string;
  description?: string;
  full_description?: string;
  banner_image_url?: string;
  otc_enabled?: boolean;
  otc_content?: string;
  website_url?: string;
  twitter_url?: string;
  linkedin_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  telegram_url?: string;
  discord_url?: string;
}

export async function updateSale(
  saleId: string,
  data: UpdateSaleRequest,
): Promise<Sale> {
  return apiFetch<Sale>(`/api/v1/sales/${saleId}`, {
    method: "PATCH",
    body: data,
  });
}

export async function setHeroImage(
  saleId: string,
  imageId: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/images/${imageId}/set-hero`, {
    method: "POST",
  });
}
