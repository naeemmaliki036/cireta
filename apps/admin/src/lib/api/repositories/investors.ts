import { apiFetch } from "../client";

export interface Investor {
  id: string;
  email: string;
  kyc_status: string;
  kyc_level: number;
  onchain_id: string | null;
  wallet_address: string | null;
  created_at: string;
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
  token?: string,
): Promise<InvestorListResponse> {
  let url = `/api/v1/admin/investors/?page=${page}&size=${size}`;
  if (kycStatus) url += `&kyc_status=${encodeURIComponent(kycStatus)}`;
  return apiFetch<InvestorListResponse>(url, { token });
}
