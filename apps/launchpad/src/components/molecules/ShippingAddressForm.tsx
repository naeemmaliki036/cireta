"use client";

import { useState } from "react";
import { CountrySelect } from "@/components/molecules/CountrySelect";
import type {
  ShippingAddress,
  ShippingAddressInput,
} from "@/lib/api/repositories/shipping-addresses";

export interface ShippingAddressFormProps {
  initial?: Partial<ShippingAddress>;
  submitLabel?: string;
  /** Show the "Set as default" checkbox. Hidden on the inline picker. */
  showDefaultToggle?: boolean;
  /** Show "Save to my address book" checkbox — used by the redemption modal
   *  when collecting an ad-hoc address. The parent decides what to do with
   *  the boolean. */
  showSaveToBookToggle?: boolean;
  saveToBook?: boolean;
  onSaveToBookChange?: (v: boolean) => void;
  busy?: boolean;
  onSubmit: (body: ShippingAddressInput) => void | Promise<void>;
  onCancel?: () => void;
}

const empty: ShippingAddressInput = {
  label: "",
  recipient_name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "",
  phone: "",
  notes: "",
  is_default: false,
};

export function ShippingAddressForm({
  initial,
  submitLabel = "Save address",
  showDefaultToggle = true,
  showSaveToBookToggle = false,
  saveToBook = false,
  onSaveToBookChange,
  busy,
  onSubmit,
  onCancel,
}: ShippingAddressFormProps) {
  const [form, setForm] = useState<ShippingAddressInput>({
    ...empty,
    ...(initial ?? {}),
    label: initial?.label ?? "",
    line2: initial?.line2 ?? "",
    region: initial?.region ?? "",
    notes: initial?.notes ?? "",
    country: initial?.country ?? "",
    is_default: initial?.is_default ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof ShippingAddressInput>(k: K, v: ShippingAddressInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.country || form.country.length !== 3) {
      setError("Please pick a country.");
      return;
    }
    if (!form.recipient_name.trim() || !form.line1.trim() || !form.city.trim() || !form.postal_code.trim() || !form.phone.trim()) {
      setError("Recipient, address, city, postal code and phone are required.");
      return;
    }
    try {
      await onSubmit({
        ...form,
        label: form.label?.trim() || null,
        line2: form.line2?.trim() || null,
        region: form.region?.trim() || null,
        notes: form.notes?.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Label (optional)" hint="Home, Office, …">
          <input
            type="text"
            value={form.label ?? ""}
            onChange={(e) => update("label", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Recipient name" required>
          <input
            type="text"
            value={form.recipient_name}
            onChange={(e) => update("recipient_name", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Address line 1" required>
          <input
            type="text"
            value={form.line1}
            onChange={(e) => update("line1", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Address line 2 (optional)">
          <input
            type="text"
            value={form.line2 ?? ""}
            onChange={(e) => update("line2", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="City" required>
          <input
            type="text"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="State / region (optional)">
          <input
            type="text"
            value={form.region ?? ""}
            onChange={(e) => update("region", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Postal code" required>
          <input
            type="text"
            value={form.postal_code}
            onChange={(e) => update("postal_code", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Country" required>
          <CountrySelect
            mode="alpha3"
            value={form.country || null}
            onChange={(v) => update("country", typeof v === "string" ? v : "")}
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <Field label="Notes (optional)" hint="Gate code, delivery instructions…">
          <input
            type="text"
            value={form.notes ?? ""}
            onChange={(e) => update("notes", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {showDefaultToggle && (
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={!!form.is_default}
            onChange={(e) => update("is_default", e.target.checked)}
          />
          Set as my default shipping address
        </label>
      )}

      {showSaveToBookToggle && (
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={saveToBook}
            onChange={(e) => onSaveToBookChange?.(e.target.checked)}
          />
          Save to my address book
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-md bg-darkAqua text-white text-sm font-semibold hover:bg-darkAqua/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-gray-100 text-text text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/40";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text/80 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {hint && <span className="ml-1 text-gray-400 font-normal">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}
