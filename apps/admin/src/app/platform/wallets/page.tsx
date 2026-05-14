"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { RegisterWalletModal } from "@/components/molecules/RegisterWalletModal";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { PlatformAdminLayout } from "@/components/templates";
import {
  listAdminWallets,
  refreshWalletStatus,
  type AdminWallet,
  type AdminWalletStats,
  type WalletStatusFilter,
} from "@/lib/api/repositories/admin-wallets";
import { resolveCountry } from "@/lib/countries";

const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function countryLabel(code: string | null): string {
  if (!code) return "—";
  const c = resolveCountry(code);
  return c ? c.name : code;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#ECF3F4] border border-zinc-200 rounded-xl p-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-zinc-200">
        <Icon className="h-4 w-4 text-[#13636F]" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="text-lg font-semibold text-zinc-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ registered }: { registered: boolean }) {
  if (registered) {
    return <Badge variant="success" size="sm">Registered</Badge>;
  }
  return (
    <Badge size="sm" className="bg-amber-100 text-amber-700 border border-amber-200">
      Pending
    </Badge>
  );
}

function RefreshButton({
  walletId,
  onRefreshed,
}: {
  walletId: string;
  onRefreshed: (id: string, registered: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    setLoading(true);
    try {
      const result = await refreshWalletStatus(walletId);
      onRefreshed(result.id, result.registered_on_chain);
    } catch {
      // silent — user can retry
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Re-check on-chain status"
      className="p-1.5 rounded hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WalletRegistryPage() {
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [stats, setStats] = useState<AdminWalletStats>({
    total_wallets: 0,
    registered_on_chain: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<WalletStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [registerTarget, setRegisterTarget] = useState<AdminWallet | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (p: number): Promise<void> => {
      setLoading(true);
      try {
        const res = await listAdminWallets({
          page: p,
          size: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status,
        });
        setWallets(res.items);
        setTotal(res.total);
        setStats(res.stats);
      } catch {
        // keep stale data on error
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, status],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  useEffect(() => {
    void fetchPage(page);
  }, [fetchPage, page]);

  const handleRefreshed = (id: string, registered: boolean): void => {
    setWallets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, registered_on_chain: registered } : w)),
    );
  };

  const handleRegisterSuccess = (): void => {
    setRegisterTarget(null);
    void fetchPage(page);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const columns: Column<AdminWallet>[] = [
    {
      key: "user_email",
      header: "User",
      render: (w) => (
        <div>
          <p className="font-medium text-sm text-zinc-900">
            {w.user_display_name ?? w.user_email.split("@")[0]}
          </p>
          <p className="text-xs text-zinc-400">{w.user_email}</p>
        </div>
      ),
    },
    {
      key: "address_checksum",
      header: "Address",
      render: (w) => (
        <CopyableAddress
          address={w.address_checksum}
          truncate
          className="text-xs"
        />
      ),
    },
    {
      key: "user_country_code",
      header: "Country",
      render: (w) => (
        <span className="text-xs text-zinc-700">{countryLabel(w.user_country_code)}</span>
      ),
    },
    {
      key: "registered_on_chain",
      header: "Status",
      render: (w) => <StatusBadge registered={w.registered_on_chain} />,
    },
    {
      key: "linked_at",
      header: "Last Synced",
      render: (w) => (
        <span className="text-xs text-zinc-500 tabular-nums">{fmtDate(w.linked_at)}</span>
      ),
    },
    {
      key: "id",
      header: "Actions",
      render: (w) => (
        <div className="flex items-center gap-1">
          <RefreshButton walletId={w.id} onRefreshed={handleRefreshed} />
          {!w.registered_on_chain && (
            <button
              onClick={(e) => { e.stopPropagation(); setRegisterTarget(w); }}
              className="text-[11px] font-medium px-2.5 py-1 rounded bg-[#13636F] text-white hover:opacity-80 transition-opacity"
            >
              Register
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PlatformAdminLayout
      title="Wallet Registry"
      description="All linked wallets across the platform — register on-chain to allow buys"
    >
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Total Wallets"
          value={loading ? "—" : String(stats.total_wallets)}
          icon={Wallet}
        />
        <KpiCard
          label="On-Chain Registered"
          value={loading ? "—" : String(stats.registered_on_chain)}
          icon={ShieldCheck}
        />
        <KpiCard
          label="Pending Registration"
          value={loading ? "—" : String(stats.pending)}
          icon={Clock}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-[36rem] max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search address, email, or country code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm font-mono bg-white focus:outline-none focus:border-[#13636F]"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WalletStatusFilter)}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
        >
          <option value="all">All</option>
          <option value="registered">Registered</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Pagination header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-400">
          {total === 0 ? "No wallets" : `Showing ${start}–${end} of ${total}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-600 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={wallets}
        emptyMessage={loading ? "Loading wallets…" : "No wallets found"}
      />

      {registerTarget && (
        <RegisterWalletModal
          wallet={registerTarget}
          onClose={() => setRegisterTarget(null)}
          onSuccess={handleRegisterSuccess}
        />
      )}
    </PlatformAdminLayout>
  );
}
