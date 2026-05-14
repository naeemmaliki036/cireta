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

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  ip_address: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
}

export interface FrozenAddress {
  wallet_address: string;
  token_id: string | null;
  reason: string;
  frozen_at: string;
  audit_log_id: string;
}

export interface FrozenAddressListResponse {
  items: FrozenAddress[];
  total: number;
}

export async function getAuditLogs(
  page = 1,
  size = 20,
  action?: string,
  token?: string,
): Promise<AuditLogListResponse> {
  let url = `/api/v1/admin/compliance/audit-logs?page=${page}&size=${size}`;
  if (action) url += `&action=${encodeURIComponent(action)}`;
  return apiFetch<AuditLogListResponse>(url, { token });
}

export async function getFrozenAddresses(token?: string): Promise<FrozenAddressListResponse> {
  return apiFetch<FrozenAddressListResponse>("/api/v1/admin/compliance/frozen", { token });
}

export async function getAuditLogActions(token?: string): Promise<string[]> {
  return apiFetch<string[]>("/api/v1/admin/audit-logs/actions", { token });
}

export interface RecoveryResponse {
  recovery_log_id: string;
  tx_hash: string;
  token_type: string;
  from_address: string;
  to_address: string;
  amount: string;
  from_user_email: string | null;
  to_user_email: string | null;
}

export async function recoverFractions(
  data: {
    sale_id: string;
    from_address: string;
    to_address: string;
    fraction_id: number;
    amount: string;
    reason: string;
  },
  token: string,
): Promise<RecoveryResponse> {
  return apiFetch<RecoveryResponse>("/api/v1/admin/compliance/recover-fractions", {
    method: "POST",
    body: data,
    token,
  });
}

export async function forceTransferERC3643(
  data: {
    token_id: string;
    from_address: string;
    to_address: string;
    amount: string;
    reason: string;
  },
  token: string,
): Promise<RecoveryResponse> {
  return apiFetch<RecoveryResponse>("/api/v1/admin/compliance/force-transfer-erc3643", {
    method: "POST",
    body: data,
    token,
  });
}
