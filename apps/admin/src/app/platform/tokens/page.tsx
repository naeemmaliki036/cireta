"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coins, LayoutGrid, List, Shield } from "lucide-react";
import { Badge, Input } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import { parseApiDate } from "@/lib/utils";

interface Token {
  id: string;
  name: string;
  symbol: string;
  asset_type: string;
  total_supply: string;
  max_supply: string | null;
  mintable: boolean;
  current_supply: string | null;
  contract_address: string | null;
  slug: string;
  created_at: string;
}

function fmtSupply(raw: string | null | undefined): string {
  const n = parseFloat(raw ?? "0");
  if (!raw || isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function SupplyText({ token }: { token: Token }) {
  const current = token.current_supply ?? token.total_supply;
  const max = token.max_supply;
  const maxN = parseFloat(max ?? "0");
  const curN = parseFloat(current ?? "0");
  const maxReached = token.mintable && max && maxN > 0 && curN >= maxN;
  return (
    <span>
      {max ? `${fmtSupply(current)} / ${fmtSupply(max)}` : fmtSupply(current)}
      {maxReached && <span className="ml-1 text-amber-600 text-[10px] font-semibold">Max reached</span>}
    </span>
  );
}

function TokenCard({ token }: { token: Token }) {
  const deployed = !!token.contract_address;

  return (
    <div className="bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text text-sm">{token.name}</h3>
          <p className="text-xs text-black/40 mt-0.5">{token.symbol} · {token.asset_type}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <Badge variant={token.mintable ? "default" : "active"} size="sm">
            {token.mintable ? "Mintable" : "Fixed"}
          </Badge>
          {deployed ? (
            <Badge variant="active" size="sm">Deployed</Badge>
          ) : (
            <Badge variant="pending" size="sm">Draft</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">{token.max_supply ? "Supply" : "Total Supply"}</p>
          <p className="font-semibold text-text font-mono"><SupplyText token={token} /></p>
        </div>
        <div className="bg-zinc-50 rounded-md px-3 py-2">
          <p className="text-black/40 mb-0.5">Contract</p>
          {token.contract_address ? (
            <CopyableAddress address={token.contract_address} truncate className="text-xs text-text" />
          ) : (
            <p className="font-semibold text-black/30">—</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-black/30">
          {deployed && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> ERC-3643</span>}
          <span>{parseApiDate(token.created_at).toLocaleDateString()}</span>
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
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 w-[36rem] max-w-full">
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
                    <td className="px-5 py-3 text-sm font-mono">
                      <SupplyText token={token} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={token.mintable ? "default" : "active"} size="sm">
                          {token.mintable ? "Mintable" : "Fixed"}
                        </Badge>
                        {token.contract_address ? (
                          <Badge variant="active" size="sm">Deployed</Badge>
                        ) : (
                          <Badge variant="pending" size="sm">Draft</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-500">
                      {token.contract_address ? (
                        <CopyableAddress address={token.contract_address} truncate />
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3 text-sm text-zinc-500">
                      {parseApiDate(token.created_at).toLocaleDateString()}
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
