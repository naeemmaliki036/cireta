"use client";

import { Download } from "lucide-react";

const REPORTS = [
  { type: "sales", label: "Sales Report", description: "Per-sale breakdown of contributions, phases, and OTC." },
  { type: "holders", label: "Holder Report", description: "Current cap table — all token holders and balances." },
  { type: "fees", label: "Fee Report", description: "Platform fees deducted per sale." },
  { type: "compliance", label: "Compliance Report", description: "Frozen addresses, forced transfers, and recovery actions." },
];

export default function ReportsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") ?? "" : "";
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const downloadReport = async (type: string) => {
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/issuer/reports/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Report generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cireta-${type}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Report download failed. Endpoint may not be implemented yet.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Reports</h1>
      <p className="text-white/40 text-sm mb-8">Export platform data as CSV.</p>
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
