import { apiFetch, apiGet, apiPost, apiPatch } from "../client";

export interface ShippingAddress {
  id: string;
  label: string | null;
  recipient_name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  /** ISO 3166-1 alpha-3, upper case. */
  country: string;
  phone: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShippingAddressInput {
  label?: string | null;
  recipient_name: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postal_code: string;
  country: string;
  phone: string;
  notes?: string | null;
  is_default?: boolean;
}

export type ShippingAddressUpdate = Partial<ShippingAddressInput>;

const BASE = "/api/v1/me/shipping-addresses";

export function listShippingAddresses(): Promise<ShippingAddress[]> {
  return apiGet<ShippingAddress[]>(BASE);
}

export function createShippingAddress(
  body: ShippingAddressInput,
): Promise<ShippingAddress> {
  return apiPost<ShippingAddress>(BASE, body);
}

export function updateShippingAddress(
  id: string,
  body: ShippingAddressUpdate,
): Promise<ShippingAddress> {
  return apiPatch<ShippingAddress>(`${BASE}/${id}`, body);
}

export async function deleteShippingAddress(id: string): Promise<void> {
  await apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
}
