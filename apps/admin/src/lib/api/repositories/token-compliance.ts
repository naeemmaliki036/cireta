import { apiFetch } from "../client";

// --- Types ---

export interface ModuleConfig {
  allowed_countries?: number[];
  max_holder_count?: number;
  current_holder_count?: number;
}

export interface ComplianceModule {
  address: string;
  name: string;
  config: ModuleConfig;
}

export interface ComplianceStatus {
  compliance_address: string;
  token_address: string | null;
  modules: ComplianceModule[];
}

export interface ComplianceTxResponse {
  success: boolean;
  tx_hash: string;
  message: string;
}

// --- API calls ---

export async function getComplianceStatus(
  tokenId: string,
): Promise<ComplianceStatus> {
  return apiFetch<ComplianceStatus>(
    `/api/v1/tokens/${tokenId}/compliance`,
  );
}

export async function addComplianceModule(
  tokenId: string,
  moduleAddress: string,
): Promise<ComplianceTxResponse> {
  return apiFetch<ComplianceTxResponse>(
    `/api/v1/tokens/${tokenId}/compliance/modules`,
    { method: "POST", body: { module_address: moduleAddress } },
  );
}

export async function removeComplianceModule(
  tokenId: string,
  moduleAddress: string,
): Promise<ComplianceTxResponse> {
  return apiFetch<ComplianceTxResponse>(
    `/api/v1/tokens/${tokenId}/compliance/modules/${moduleAddress}`,
    { method: "DELETE" },
  );
}

export async function updateCountryAllow(
  tokenId: string,
  data: {
    module_address: string;
    add_countries: number[];
    remove_countries: number[];
  },
): Promise<ComplianceTxResponse> {
  return apiFetch<ComplianceTxResponse>(
    `/api/v1/tokens/${tokenId}/compliance/country-allow`,
    { method: "POST", body: data },
  );
}

export async function setMaxHolderCount(
  tokenId: string,
  data: {
    module_address: string;
    max_count: number;
  },
): Promise<ComplianceTxResponse> {
  return apiFetch<ComplianceTxResponse>(
    `/api/v1/tokens/${tokenId}/compliance/max-holders`,
    { method: "POST", body: data },
  );
}
