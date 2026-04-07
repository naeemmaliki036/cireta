"use client";

import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { Badge, Input } from "@/components/atoms";
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch<{ items: Token[] }>("/api/v1/tokens?page=1&size=100")
      .then((data) => setTokens(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sanitizedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  const filtered = tokens.filter((t) =>
    !sanitizedSearch ||
    t.name.toLowerCase().includes(sanitizedSearch.toLowerCase()) ||
    t.symbol.toLowerCase().includes(sanitizedSearch.toLowerCase()) ||
    t.contract_address?.toLowerCase().includes(sanitizedSearch.toLowerCase()),
  );
  const deployed = tokens.filter((t) => t.contract_address);

  return (
    <PlatformAdminLayout
      title="All Tokens"
      description="Tokens across all issuers on the platform"
    >
      {/* Inline stats */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <Coins className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-zinc-500">Total Tokens</span>
          <span className="font-semibold text-zinc-900">{tokens.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <Coins className="h-3.5 w-3.5 text-green-600" />
          <span className="text-zinc-500">Deployed</span>
          <span className="font-semibold text-zinc-900">{deployed.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <Coins className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-zinc-500">Draft</span>
          <span className="font-semibold text-zinc-900">{tokens.length - deployed.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-xs">
        <Input placeholder="Search by name, symbol, or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-sm">No tokens found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-5 py-3">Token</th>
                <th className="px-5 py-3">Asset Type</th>
                <th className="px-5 py-3">Supply</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Contract</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((token) => (
                <tr key={token.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-sm">{token.name}</p>
                    <p className="text-xs text-zinc-400">{token.symbol}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="default" size="sm" className="capitalize">{token.asset_type}</Badge>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono">{Number(token.total_supply).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    {token.contract_address ? (
                      <Badge variant="active" size="sm">Deployed</Badge>
                    ) : (
                      <Badge variant="pending" size="sm">Draft</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-zinc-500">
                    {token.contract_address
                      ? `${token.contract_address.slice(0, 6)}...${token.contract_address.slice(-4)}`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-sm text-zinc-500">
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
