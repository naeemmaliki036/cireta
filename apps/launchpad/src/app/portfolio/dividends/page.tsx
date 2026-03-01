"use client";

import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";

interface DividendEntry {
  token_symbol: string;
  token_name: string;
  claimable_usdc: string;
  total_earned: string;
}

export default function DividendsPage() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    fetch("/api/v1/portfolio/dividends", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setDividends(data.dividends ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Dividend Claims</h1>
        {loading ? (
          <div className="text-white/40 text-sm">Loading...</div>
        ) : dividends.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-12 text-center">
            <Coins className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40">No dividend distributions available.</p>
            <p className="text-white/20 text-sm mt-1">Dividends appear here when issuers distribute revenue to token holders.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dividends.map((d, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{d.token_name}</p>
                  <p className="text-white/40 text-sm">{d.token_symbol}</p>
                  <p className="text-white/30 text-xs mt-1">Total earned: {d.total_earned} USDC</p>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold text-lg">{d.claimable_usdc} USDC</p>
                  <Button variant="primary" size="sm" className="mt-2">Claim</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
