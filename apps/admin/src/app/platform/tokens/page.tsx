"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coins, LayoutGrid, List, Copy, Shield } from "lucide-react";
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

function TokenCard({ token }: { token: Token }) {
  const deployed = !!token.contract_address;
  const masked = deployed ? `${token.contract_address!.slice(0, 6)}...${token.contract_address!.slice(-4)}` : null;

  return (
    <div className="bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text text-sm">{token.name}</h3>
          <p className="text-xs text-black/40 mt-0.5">{token.symbol} · {token.asset_type}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {deployed ? (
            <Badge variant="active" size="sm">Deployed</Badge>
          ) : (
            <Badge variant="pending" size="sm">Draft</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">Total Supply</p>
          <p className="font-semibold text-text font-mono">{Number(token.total_supply).toLocaleString()}</p>
        </div>
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">Contract</p>
          {masked ? (
            <button onClick={() => navigator.clipboard.writeText(token.contract_address!)}
              className="flex items-center gap-1 font-mono font-semibold text-text hover:text-darkAqua transition-colors cursor-pointer">
              {masked} <Copy className="h-3 w-3 text-black/20" />
            </button>
          ) : (
            <p className="font-semibold text-black/30">—</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-black/30">
          {deployed && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> ERC-3643</span>}
          <span>{new Date(token.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function PlatformTokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

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

      {/* Search + View Toggle */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="max-w-xs">
          <Input placeholder="Search by name, symbol, or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
          <button onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="text-zinc-400 text-sm">Loading...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-zinc-100">
          <div className="w-14 h-14 rounded-lg bg-zinc-100 flex items-center justify-center mx-auto mb-3">
            <Coins className="h-7 w-7 text-zinc-300" />
          </div>
          <p className="text-black/40 text-sm">No tokens found</p>
        </div>
      ) : (
        viewMode === "list" ? (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
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
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((token, i) => (
              <motion.div key={token.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <TokenCard token={token} />
              </motion.div>
            ))}
          </div>
        )
      )}
    </PlatformAdminLayout>
  );
}
