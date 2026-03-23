"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";

interface Redemption {
  id: string;
  user_id: string;
  token_id: string;
  amount: string;
  status: string;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  tx_hash: string | null;
  created_at: string | null;
}

const STATUS_FLOW = ["pending", "processing", "shipped", "fulfilled"];

export default function RedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchRedemptions = async () => {
    try {
      const data = await apiFetch<{ redemptions: Redemption[] }>("/api/v1/admin/redemptions");
      setRedemptions(data.redemptions ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchRedemptions(); }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await apiFetch(`/api/v1/admin/redemptions/${id}`, {
        method: "PATCH",
        body: { status },
      });
      fetchRedemptions();
    } catch { /* ignore */ } finally { setUpdating(null); }
  };

  const nextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current);
    return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Redemption Requests</h1>
      {loading ? <p className="text-white/40 text-sm">Loading...</p> :
       redemptions.length === 0 ? <p className="text-white/40 text-sm">No redemption requests.</p> : (
        <div className="space-y-4">
          {redemptions.map((r) => {
            const next = nextStatus(r.status);
            return (
              <div key={r.id} className="bg-white/5 rounded-xl p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-medium">{Number(r.amount).toLocaleString()} tokens</p>
                    <p className="text-white/40 text-xs mt-0.5">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    r.status === "fulfilled" ? "bg-green-500/20 text-green-400" :
                    r.status === "shipped" ? "bg-blue-500/20 text-blue-400" :
                    r.status === "processing" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-white/10 text-white/40"
                  }`}>{r.status}</span>
                </div>
                {r.delivery_name && (
                  <div className="text-sm text-white/50 space-y-0.5">
                    <p><span className="text-white/30">Name:</span> {r.delivery_name}</p>
                    {r.delivery_address && <p><span className="text-white/30">Address:</span> {r.delivery_address}</p>}
                    {r.delivery_phone && <p><span className="text-white/30">Phone:</span> {r.delivery_phone}</p>}
                  </div>
                )}
                {next && r.status !== "cancelled" && (
                  <button
                    onClick={() => updateStatus(r.id, next)}
                    disabled={updating === r.id}
                    className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5"
                  >
                    {updating === r.id ? "Updating..." : `Mark as ${next}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
