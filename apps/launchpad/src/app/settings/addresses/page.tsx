"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Trash2, Star, Pencil } from "lucide-react";
import { formatCountry } from "@/lib/countries";
import { ShippingAddressForm } from "@/components/molecules/ShippingAddressForm";
import {
  listShippingAddresses,
  createShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  type ShippingAddress,
  type ShippingAddressInput,
} from "@/lib/api/repositories/shipping-addresses";

export default function ShippingAddressesPage() {
  const [items, setItems] = useState<ShippingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listShippingAddresses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load addresses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = async (body: ShippingAddressInput) => {
    setBusy(true);
    try {
      await createShippingAddress(body);
      setAdding(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = (id: string) => async (body: ShippingAddressInput) => {
    setBusy(true);
    try {
      await updateShippingAddress(id, body);
      setEditingId(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this shipping address? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteShippingAddress(id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const handleMakeDefault = async (id: string) => {
    setBusy(true);
    try {
      await updateShippingAddress(id, { is_default: true });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <MapPin className="w-6 h-6 text-darkAqua" /> Shipping Addresses
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Saved addresses for physical redemption deliveries. The default is
            preselected when you request a physical redemption.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-darkAqua text-white text-sm font-semibold hover:bg-darkAqua/90"
          >
            <Plus className="w-4 h-4" /> Add address
          </button>
        )}
      </div>

      {adding && (
        <section className="mb-6 bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-text mb-3">New shipping address</h2>
          <ShippingAddressForm
            busy={busy}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-3">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No saved addresses yet. Add one above so it&apos;s preselected on your next
          physical redemption.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const editing = editingId === a.id;
            return (
              <li
                key={a.id}
                className="bg-white border border-gray-200 rounded-lg p-4"
              >
                {editing ? (
                  <ShippingAddressForm
                    initial={a}
                    submitLabel="Save changes"
                    busy={busy}
                    onSubmit={handleUpdate(a.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-text">
                          {a.label || a.recipient_name}
                        </p>
                        {a.is_default && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-darkAqua/10 text-darkAqua px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text">{a.recipient_name}</p>
                      <p className="text-sm text-gray-600 whitespace-pre-line">
                        {a.line1}
                        {a.line2 ? `\n${a.line2}` : ""}
                        {"\n"}
                        {[a.city, a.region, a.postal_code]
                          .filter(Boolean)
                          .join(", ")}
                        {"\n"}
                        {formatCountry(a.country)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Phone: {a.phone}</p>
                      {a.notes && (
                        <p className="text-xs text-gray-500 mt-1">Notes: {a.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {!a.is_default && (
                        <button
                          type="button"
                          onClick={() => handleMakeDefault(a.id)}
                          disabled={busy}
                          title="Set as default"
                          className="p-1.5 rounded-md text-gray-500 hover:text-darkAqua hover:bg-darkAqua/5 disabled:opacity-40"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(a.id);
                          setAdding(false);
                        }}
                        disabled={busy}
                        title="Edit"
                        className="p-1.5 rounded-md text-gray-500 hover:text-darkAqua hover:bg-darkAqua/5 disabled:opacity-40"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={busy}
                        title="Delete"
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
