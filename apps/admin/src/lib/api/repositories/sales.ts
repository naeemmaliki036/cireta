import { apiFetch } from "../client";

export interface SalePhase {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  sold: string;
  min_contribution: string;
  max_contribution: string;
  start_time: string;
  end_time: string;
  whitelist_only?: boolean;
  // Whole-token buy fields
  min_tokens: string;
  max_tokens: string;
  top_up_min_tokens: string;
  allocation_mode: string;
  // Tentative phase support
  deployed_on_chain: boolean;
  on_chain_phase_id: number | null;
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
  is_visible: boolean;
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
  cliff_duration_seconds: number;
  vesting_duration_seconds: number;
  contract_address: string | null;
  token_contract_address: string | null;
  identity_registry_address: string | null;
  phases: SalePhase[];
  token_name: string | null;
  token_symbol: string | null;
  issuer_name: string | null;
  created_at: string;
  // Round-5 fields
  is_open_ended: boolean;
  total_token_supply: string | null;
  approved_at: string | null;
  activated_at: string | null;
  refunds_activated_at: string | null;
  finalization_pending: boolean;
  sale_start_time: string | null;
  sale_end_time: string | null;
  display_order: number | null;
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
    `/api/v1/sales?page=${page}&size=${size}`,
    { token },
  );
}

export async function getAdminSales(
  page = 1,
  size = 20,
): Promise<SaleListResponse> {
  return apiFetch<SaleListResponse>(
    `/api/v1/admin/sales?page=${page}&size=${size}`,
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
  cliff_duration_seconds?: number;
  vesting_duration_seconds?: number;
  token_id?: string;
  payment_token?: string;
  soft_cap?: string;
  hard_cap?: string;
  // Round-5: explicit total token supply + optional sale window
  total_token_supply?: string;
  sale_start_time?: string;
  sale_end_time?: string; // undefined = open-ended
  phases?: {
    name: string;
    allocation: number;
    price_per_token: string;
    start_time: string;
    end_time: string;
    // Round-5: required by Pydantic — defaults provided by callers
    min_contribution?: string;
    top_up_min?: string;
    allocation_mode?: "fixed" | "remaining";
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

export async function removeSaleTeamMember(
  saleId: string,
  memberId: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/team/${memberId}`, {
    method: "DELETE",
  });
}

export async function removeSaleFAQ(
  saleId: string,
  faqId: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/faqs/${faqId}`, {
    method: "DELETE",
  });
}

export async function removeSaleDocument(
  saleId: string,
  docId: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/documents/${docId}`, {
    method: "DELETE",
  });
}

export interface UpdateSaleRequest {
  // Content / marketing — always editable
  title?: string;
  description?: string;
  full_description?: string;
  banner_image_url?: string;
  otc_enabled?: boolean;
  otc_content?: string;
  otc_token_address?: string;
  is_redeemable?: boolean;
  website_url?: string;
  twitter_url?: string;
  linkedin_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  telegram_url?: string;
  discord_url?: string;
  // Financial / structural — draft-only
  is_coming_soon?: boolean;
  sale_mode?: string;
  sale_structure?: string;
  cliff_duration_seconds?: number;
  vesting_duration_seconds?: number;
  token_id?: string;
  payment_token?: string;
  soft_cap?: string;
  hard_cap?: string;
  total_token_supply?: string;
  sale_start_time?: string;
  sale_end_time?: string;
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

// Sub-resource getters (used by the wizard's edit-mode prefill)

export async function listSaleTeamMembers(saleId: string, token?: string): Promise<Array<{ id: string; name: string; title?: string; bio?: string; photo_url?: string }>> {
  return apiFetch(`/api/v1/sales/${saleId}/team`, { token });
}

export async function listSaleFAQs(saleId: string, token?: string): Promise<Array<{ id: string; question: string; answer: string }>> {
  return apiFetch(`/api/v1/sales/${saleId}/faqs`, { token });
}

export async function listSaleDocuments(saleId: string, token?: string): Promise<Array<{ id: string; name: string; type: string; url: string }>> {
  return apiFetch(`/api/v1/sales/${saleId}/documents`, { token });
}

export async function listSaleImages(saleId: string, token?: string): Promise<Array<{ id: string; url: string; caption?: string; is_banner?: boolean; sort_order?: number; media_type?: string; video_url?: string }>> {
  return apiFetch(`/api/v1/sales/${saleId}/images`, { token });
}

export async function setHeroImage(
  saleId: string,
  imageId: string,
): Promise<void> {
  await apiFetch(`/api/v1/sales/${saleId}/images/${imageId}/set-hero`, {
    method: "POST",
  });
}

// Phase management (tentative + deployed)

export async function createPhase(
  saleId: string,
  data: {
    name: string;
    price_per_token: string;
    allocation: string;
    min_contribution: string;
    max_contribution?: string;
    top_up_min?: string;
    start_time: string;
    end_time: string;
    whitelist_only?: boolean;
    allocation_mode?: string;
    deployed_on_chain?: boolean;
    on_chain_phase_id?: number;
  },
  token?: string,
): Promise<{ phase_id: string; phase_number: number }> {
  return apiFetch(`/api/v1/sales/${saleId}/phases`, {
    method: "POST",
    body: data,
    token,
  });
}

export async function updatePhase(
  saleId: string,
  phaseId: string,
  data: Partial<{
    name: string;
    price_per_token: string;
    allocation: string;
    min_contribution: string;
    max_contribution: string;
    top_up_min: string;
    start_time: string;
    end_time: string;
    whitelist_only: boolean;
    allocation_mode: string;
    deployed_on_chain: boolean;
    on_chain_phase_id: number;
  }>,
  token?: string,
): Promise<{ phase_id: string; status: string }> {
  return apiFetch(`/api/v1/sales/${saleId}/phases/${phaseId}`, {
    method: "PATCH",
    body: data,
    token,
  });
}

export async function deletePhase(
  saleId: string,
  phaseId: string,
  token?: string,
): Promise<{ status: string }> {
  return apiFetch(`/api/v1/sales/${saleId}/phases/${phaseId}`, {
    method: "DELETE",
    token,
  });
}

// OTC Operator management

export interface OtcOperatorsResponse {
  operators: string[];
}

export async function getOtcOperators(
  saleId: string,
  token?: string,
): Promise<OtcOperatorsResponse> {
  return apiFetch<OtcOperatorsResponse>(
    `/api/v1/admin/sales/${saleId}/otc-operators`,
    { token },
  );
}

export async function addOtcOperator(
  saleId: string,
  address: string,
  token?: string,
): Promise<OtcOperatorsResponse> {
  return apiFetch<OtcOperatorsResponse>(
    `/api/v1/admin/sales/${saleId}/otc-operators`,
    { method: "POST", body: { address }, token },
  );
}

export async function removeOtcOperator(
  saleId: string,
  address: string,
  token?: string,
): Promise<OtcOperatorsResponse> {
  return apiFetch<OtcOperatorsResponse>(
    `/api/v1/admin/sales/${saleId}/otc-operators`,
    { method: "DELETE", body: { address }, token },
  );
}
