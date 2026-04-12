"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { isAddress } from "viem";
import {
  getOtcOperators,
  addOtcOperator,
  removeOtcOperator,
} from "@/lib/api/repositories/sales";

export default function OtcOperatorsPage() {
  const { id: saleId } = useParams<{ id: string }>();
  const [operators, setOperators] = useState<string[]>([]);
  const [newAddr, setNewAddr] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!saleId) return;
    getOtcOperators(saleId)
      .then((r) => setOperators(r.operators))
      .catch(() => setMessage("Failed to load operators"))
      .finally(() => setLoading(false));
  }, [saleId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddress(newAddr)) {
      setMessage("Invalid address");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const r = await addOtcOperator(saleId, newAddr);
      setOperators(r.operators);
      setNewAddr("");
      setMessage("Operator added");
    } catch {
      setMessage("Failed to add operator");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (addr: string) => {
    setSubmitting(true);
    setMessage("");
    try {
      const r = await removeOtcOperator(saleId, addr);
      setOperators(r.operators);
      setMessage("Operator removed");
    } catch {
      setMessage("Failed to remove operator");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/issuer/sales/${saleId}`}
        className="flex items-center gap-2 text-black/40 hover:text-text text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sale
      </Link>
      <h1 className="text-2xl font-bold text-text mb-2">OTC Operators</h1>
      <p className="text-black/40 text-sm mb-6">
        Wallets designated as OTC operators for this sale. Operators buy fractions
        via OTC tokens then transfer to buyer wallets.
      </p>

      {message && (
        <p
          className={`text-sm mb-4 p-3 rounded-lg ${
            message.includes("Failed") || message.includes("Invalid")
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-green-50 text-green-600 border border-green-200"
          }`}
        >
          {message}
        </p>
      )}

      {/* Add operator form */}
      <form
        onSubmit={handleAdd}
        className="flex gap-2 mb-6"
      >
        <input
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
          placeholder="0x... operator wallet address"
          maxLength={42}
          className={`flex-1 bg-box border rounded-lg px-3 py-2 text-text text-sm ${
            newAddr && !isAddress(newAddr) ? "border-red-300" : "border-black/10"
          }`}
        />
        <button
          type="submit"
          disabled={submitting || !newAddr}
          className="flex items-center gap-1.5 bg-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>

      {/* Operator list */}
      <div className="bg-white rounded-xl border border-black/10 divide-y divide-black/5">
        {loading ? (
          <p className="p-4 text-sm text-black/40">Loading...</p>
        ) : operators.length === 0 ? (
          <p className="p-4 text-sm text-black/40">No OTC operators configured.</p>
        ) : (
          operators.map((addr) => (
            <div key={addr} className="flex items-center justify-between p-4">
              <code className="text-sm text-text">{addr}</code>
              <button
                type="button"
                onClick={() => handleRemove(addr)}
                disabled={submitting}
                className="text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
