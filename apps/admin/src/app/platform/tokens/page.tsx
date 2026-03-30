"use client";

import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { Badge } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  contract_address: string | null;
  slug: string;
  created_at: string;
}

export default function PlatformTokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: Token[] }>("/api/v1/tokens/?page=1&size=100")
      .then((data) => setTokens(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deployed = tokens.filter((t) => t.contract_address);

  return (
    <PlatformAdminLayout
      title="All Tokens"
      description="Tokens across all issuers on the platform"
      breadcrumbs={[{ label: "Platform" }, { label: "Tokens" }]}
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
            <Coins className="h-6 w-6 text-teal-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Total Tokens</p>
            <p className="text-2xl font-bold">{tokens.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
            <Coins className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Deployed</p>
            <p className="text-2xl font-bold">{deployed.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
            <Coins className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Draft</p>
            <p className="text-2xl font-bold">{tokens.length - deployed.length}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : tokens.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">No tokens created yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-6 py-3">Token</th>
                <th className="px-6 py-3">Asset Type</th>
                <th className="px-6 py-3">Supply</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Contract</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-sm">{token.name}</p>
                    <p className="text-xs text-zinc-400">{token.symbol}</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="default" size="sm" className="capitalize">{token.asset_type}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono">{Number(token.total_supply).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {token.contract_address ? (
                      <Badge variant="active" size="sm">Deployed</Badge>
                    ) : (
                      <Badge variant="pending" size="sm">Draft</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-zinc-500">
                    {token.contract_address
                      ? `${token.contract_address.slice(0, 6)}...${token.contract_address.slice(-4)}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500">
                    {new Date(token.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PlatformAdminLayout>
  );
}
