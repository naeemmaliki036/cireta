"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

const REPORTS = [
  { type: "sales", label: "Sales Report", description: "Per-sale breakdown of contributions, phases, and OTC." },
  { type: "holders", label: "Holder Report", description: "Current cap table — all token holders and balances." },
  { type: "fees", label: "Fee Report", description: "Platform fees deducted per sale." },
  { type: "compliance", label: "Compliance Report", description: "Frozen addresses, forced transfers, and recovery actions." },
];

export default function ReportsPage() {
  const [error, setError] = useState("");

  const downloadReport = async (type: string) => {
    setError("");
    try {
      const blob = await apiFetch<Blob>(`/api/v1/admin/issuer/reports/${type}`, {
        headers: { Accept: "text/csv" },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cireta-${type}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download ${type} report. The endpoint may not be available yet.`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Reports</h1>
      <p className="text-white/40 text-sm mb-8">Export platform data as CSV.</p>
      {error && <p className="text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</p>}
      <div className="space-y-3">
        {REPORTS.map(({ type, label, description }) => (
          <div key={type} className="bg-white/5 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{label}</p>
              <p className="text-white/40 text-sm mt-0.5">{description}</p>
            </div>
            <button
              onClick={() => downloadReport(type)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
