import { apiFetch } from "../client";

export interface Investor {
  id: string;
  email: string;
  display_name: string | null;
  investor_type: string | null;
  kyc_status: string;
  kyc_level: number;
  onchain_id: string | null;
  wallet_address: string | null;
  wallet_count: number;
  onboarding_completed: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface InvestorDetail extends Investor {
  nationality: string | null;
  country_of_residence: string | null;
  date_of_birth: string | null;
  company_name: string | null;
  company_registration_number: string | null;
  company_jurisdiction: string | null;
  kyc_provider: string | null;
  kyc_verified_at: string | null;
  is_accredited: boolean;
  wallets: { id: string; address: string; is_primary: boolean; created_at: string | null }[];
}

export interface InvestorListResponse {
  items: Investor[];
  total: number;
  page: number;
  size: number;
}

export async function getInvestors(
  page = 1,
  size = 20,
  kycStatus?: string,
): Promise<InvestorListResponse> {
  let url = `/api/v1/admin/investors/?page=${page}&size=${size}`;
  if (kycStatus) url += `&kyc_status=${encodeURIComponent(kycStatus)}`;
  return apiFetch<InvestorListResponse>(url);
}

export async function getInvestor(id: string): Promise<InvestorDetail> {
  return apiFetch<InvestorDetail>(`/api/v1/admin/investors/${id}`);
}
