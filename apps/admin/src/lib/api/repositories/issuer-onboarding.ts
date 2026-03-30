import { apiGet, apiPost, apiDelete } from "../client";

// ── Whitelist ──

export interface WhitelistEntry {
  id: string;
  email: string;
  issuer_type: "individual" | "corporate";
  kyc_required: boolean;
  invited_by: string;
  registered_at: string | null;
  created_at: string;
}

export interface WhitelistListResponse {
  items: WhitelistEntry[];
  total: number;
}

export async function getWhitelist(): Promise<WhitelistListResponse> {
  return apiGet<WhitelistListResponse>("/api/v1/admin/issuers/whitelist");
}

export async function addToWhitelist(
  email: string,
  issuerType: "individual" | "corporate",
  kycRequired: boolean = true
): Promise<WhitelistEntry> {
  return apiPost<WhitelistEntry>("/api/v1/admin/issuers/whitelist", {
    email,
    issuer_type: issuerType,
    kyc_required: kycRequired,
  });
}

export async function removeFromWhitelist(entryId: string): Promise<void> {
  return apiDelete(`/api/v1/admin/issuers/whitelist/${entryId}`);
}

// ── Issuer Wallet Approval ──

export async function approveIssuerWallet(issuerId: string): Promise<void> {
  await apiPost(`/api/v1/admin/issuers/${issuerId}/approve-wallet`);
}

export async function rejectIssuerWallet(issuerId: string): Promise<void> {
  await apiPost(`/api/v1/admin/issuers/${issuerId}/reject-wallet`);
}

export async function skipIssuerIdentity(issuerId: string): Promise<void> {
  await apiPost(`/api/v1/admin/issuers/${issuerId}/skip-identity`);
}

// ── Issuer Onboarding (issuer-facing) ──

export interface OnboardingStatus {
  issuer_status: string;
  issuer_type: string;
  wallet_connected: boolean;
  wallet_status: string;
  identity_status: string;
  can_deploy: boolean;
  missing_gates: string[];
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return apiGet<OnboardingStatus>("/api/v1/issuer/onboarding-status");
}

export async function submitWallet(walletAddress: string): Promise<{ wallet_address: string; wallet_status: string }> {
  return apiPost("/api/v1/issuer/wallet", { wallet_address: walletAddress });
}

export async function initiateIdentity(): Promise<{
  applicant_id: string;
  access_token: string;
  expiration: string | null;
  verification_type: "kyc" | "kyb";
}> {
  return apiPost("/api/v1/issuer/identity/initiate");
}

export async function getIdentityStatus(): Promise<{
  identity_status: string;
  identity_verified_at: string | null;
  issuer_type: string;
  verification_type: "kyc" | "kyb";
}> {
  return apiGet("/api/v1/issuer/identity/status");
}
