import { apiFetch } from "../client";

export interface ComplianceActionResponse {
  success: boolean;
  action: string;
  details: Record<string, unknown>;
  audit_log_id: string;
}

export async function freezeAddress(
  data: { wallet_address: string; token_id?: string; reason: string },
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>("/api/v1/admin/compliance/freeze", {
    method: "POST",
    body: data,
    token,
  });
}

export async function unfreezeAddress(
  data: { wallet_address: string; token_id?: string; reason: string },
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>("/api/v1/admin/compliance/unfreeze", {
    method: "POST",
    body: data,
    token,
  });
}

export async function forcedTransfer(
  data: {
    token_id: string;
    from_address: string;
    to_address: string;
    amount: string;
    reason: string;
  },
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>(
    "/api/v1/admin/compliance/forced-transfer",
    { method: "POST", body: data, token },
  );
}

export async function recoverTokens(
  data: {
    token_id: string;
    from_address: string;
    amount: string;
    reason: string;
  },
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>("/api/v1/admin/compliance/recover", {
    method: "POST",
    body: data,
    token,
  });
}

export async function pauseToken(
  tokenId: string,
  reason: string,
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>(
    `/api/v1/admin/compliance/pause/${tokenId}?reason=${encodeURIComponent(reason)}`,
    { method: "POST", token },
  );
}

export async function unpauseToken(
  tokenId: string,
  reason: string,
  token: string,
): Promise<ComplianceActionResponse> {
  return apiFetch<ComplianceActionResponse>(
    `/api/v1/admin/compliance/unpause/${tokenId}?reason=${encodeURIComponent(reason)}`,
    { method: "POST", token },
  );
}
