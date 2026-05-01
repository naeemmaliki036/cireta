"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { UserDetailDrawer } from "@/components/organisms/UserDetailDrawer";
import { PlatformAdminLayout } from "@/components/templates";
import { getInvestors, type Investor, type Holding } from "@/lib/api/repositories/buyers";
import { resolveCountry } from "@/lib/countries";

const KYC_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Basic",
  2: "Enhanced",
  3: "Accredited",
  4: "Corporate",
};

function fmtUSDC(v: string | null | undefined): string {
  if (!v || v === "0") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC";
}

function fmtTokens(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function countryLabel(value: string | null | undefined): string {
  const c = resolveCountry(value);
  return c?.name ?? (value ?? "—");
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // YYYY-MM-DD or ISO datetime — show date only
  return d.slice(0, 10);
}

function relativeJoined(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function TypeBadge({ type }: { type: string | null }) {
  const label = type ?? "individual";
  if (label === "corporate") return <Badge variant="success" size="sm">Corporate</Badge>;
  if (label === "institutional") return <Badge variant="default" size="sm">Institutional</Badge>;
  return <Badge variant="default" size="sm">Individual</Badge>;
}

function MismatchHint({ self, verified }: { self: string | null; verified: string | null }) {
  if (!self || !verified) return null;
  if (self === verified) return null;
  return (
    <span title={`Self-reported: ${self} · Verified: ${verified}`}>
      <AlertTriangle className="h-3 w-3 text-amber-500 inline ml-0.5" />
    </span>
  );
}

function HoldingsCell({ holdings, total }: { holdings: Holding[]; total: number }) {
  if (holdings.length === 0) return <span className="text-zinc-300">—</span>;
  const more = total - holdings.length;
  return (
    <div className="space-y-0.5">
      {holdings.map((h) => (
        <div key={h.sale_id} className="flex items-baseline gap-1.5 text-xs">
          <span className="font-medium text-zinc-700 truncate max-w-[100px]" title={h.sale_name}>
            {h.token_symbol ?? h.sale_name}
          </span>
          <span className="font-mono text-zinc-500 tabular-nums">{fmtTokens(h.tokens_held)}</span>
        </div>
      ))}
      {more > 0 && <p className="text-[10px] text-zinc-400">+{more} more</p>}
    </div>
  );
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<Investor[]>([]);
  const [drawerUser, setDrawerUser] = useState<Investor | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestors(1, 100);
        setUsers(data.items);
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.verified_full_name ?? "").toLowerCase().includes(q) ||
        (u.wallet_address ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || u.kyc_status === statusFilter;
      const matchesType = typeFilter === "all" || (u.investor_type ?? "individual") === typeFilter;
      const matchesActive = !activeOnly || u.participation_count > 0;
      return matchesSearch && matchesStatus && matchesType && matchesActive;
    });
  }, [users, searchQuery, statusFilter, typeFilter, activeOnly]);

  const stats = useMemo(() => {
    const approved = users.filter((u) => u.kyc_status === "approved").length;
    const active = users.filter((u) => u.participation_count > 0).length;
    const totalContributed = users.reduce((acc, u) => acc + Number(u.total_contributed_usdc || 0), 0);
    return { total: users.length, approved, active, totalContributed };
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const columns: Column<Investor>[] = [
    {
      key: "email",
      header: "User",
      render: (u) => (
        <div>
          <p className="font-medium text-sm text-zinc-900 flex items-center gap-1.5">
            {u.verified_full_name || u.display_name || u.email.split("@")[0]}
          </p>
          <p className="text-xs text-zinc-400">{u.email}</p>
          <div className="mt-1"><TypeBadge type={u.investor_type} /></div>
        </div>
      ),
    },
    {
      key: "kyc_status",
      header: "KYC",
      render: (u) => (
        <div className="space-y-0.5">
          <Badge
            variant={
              u.kyc_status === "approved" ? "success"
                : u.kyc_status === "pending" ? "pending"
                : u.kyc_status === "rejected" ? "error"
                : "default"
            }
            size="sm"
          >
            {u.kyc_status}
          </Badge>
          <p className="text-[10px] text-zinc-400">{KYC_LABELS[u.kyc_level] ?? `Lvl ${u.kyc_level}`}</p>
        </div>
      ),
    },
    {
      key: "dob_phone",
      header: "DOB · Phone",
      render: (u) => {
        if (u.investor_type === "corporate") return <span className="text-zinc-300">—</span>;
        return (
          <div className="text-xs space-y-0.5">
            <p className="text-zinc-700 font-mono tabular-nums">
              {fmtDate(u.verified_date_of_birth || u.date_of_birth)}
              <MismatchHint self={u.date_of_birth} verified={u.verified_date_of_birth} />
            </p>
            <p className="text-zinc-500 font-mono">
              {u.verified_phone_number || u.phone_number || "—"}
              <MismatchHint self={u.phone_number} verified={u.verified_phone_number} />
            </p>
          </div>
        );
      },
    },
    {
      key: "nationality",
      header: "Nationality",
      render: (u) => {
        if (u.investor_type === "corporate") return <span className="text-zinc-300">—</span>;
        const value = u.verified_nationality || u.nationality;
        return (
          <span className="text-xs text-zinc-700">
            {countryLabel(value)}
            <MismatchHint self={u.nationality} verified={u.verified_nationality} />
          </span>
        );
      },
    },
    {
      key: "residence",
      header: "Residence",
      render: (u) => {
        if (u.investor_type === "corporate") return <span className="text-zinc-300">—</span>;
        const value = u.verified_country_of_residence || u.country_of_residence;
        return (
          <span className="text-xs text-zinc-700">
            {countryLabel(value)}
            <MismatchHint self={u.country_of_residence} verified={u.verified_country_of_residence} />
          </span>
        );
      },
    },
    {
      key: "company",
      header: "Company",
      render: (u) => {
        if (u.investor_type !== "corporate") return <span className="text-zinc-300">—</span>;
        return (
          <div className="text-xs space-y-0.5">
            <p className="font-medium text-zinc-700">
              {u.verified_company_name || u.company_name || "—"}
              <MismatchHint self={u.company_name} verified={u.verified_company_name} />
            </p>
            <p className="text-zinc-500">
              {countryLabel(u.verified_company_jurisdiction || u.company_jurisdiction)}
              {u.verified_company_registration_number || u.company_registration_number
                ? ` · ${u.verified_company_registration_number || u.company_registration_number}`
                : ""}
            </p>
          </div>
        );
      },
    },
    {
      key: "wallets",
      header: "Wallets",
      render: (u) => <span className="font-mono text-sm tabular-nums">{u.wallet_count}</span>,
    },
    {
      key: "participation",
      header: "Projects",
      render: (u) =>
        u.participation_count > 0 ? (
          <Badge variant="success" size="sm">{u.participation_count}</Badge>
        ) : (
          <span className="text-zinc-300">—</span>
        ),
    },
    {
      key: "holdings",
      header: "Holdings",
      render: (u) => <HoldingsCell holdings={u.top_holdings} total={u.participation_count} />,
    },
    {
      key: "contributed",
      header: "Contributed",
      render: (u) => (
        <span className="text-xs font-mono tabular-nums text-zinc-700">{fmtUSDC(u.total_contributed_usdc)}</span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (u) => (
        <span className="text-xs text-zinc-500" title={u.created_at}>{relativeJoined(u.created_at)}</span>
      ),
    },
  ];

  return (
    <PlatformAdminLayout title="Users / Buyers" description="Registered investors with KYC, holdings, and on-chain activity">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Members" value={loading ? "—" : String(stats.total)} icon={Users} />
        <KpiCard label="Approved KYC" value={loading ? "—" : String(stats.approved)} icon={ShieldCheck} />
        <KpiCard label="Active in Sales" value={loading ? "—" : String(stats.active)} icon={TrendingUp} />
        <KpiCard label="Total Contributed" value={loading ? "—" : fmtUSDC(String(stats.totalContributed))} icon={Wallet} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search name, email, wallet…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
        >
          <option value="all">All KYC</option>
          <option value="none">Unverified</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
        >
          <option value="all">All Types</option>
          <option value="individual">Individual</option>
          <option value="corporate">Corporate</option>
          <option value="institutional">Institutional</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => { setActiveOnly(e.target.checked); setPage(1); }}
          />
          Active in sales only
        </label>
      </div>

      {/* Pagination header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-400">
          Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-600 px-2">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={paged}
        onRowClick={(row) => setDrawerUser(row)}
        emptyMessage={loading ? "Loading users..." : "No users found"}
      />

      <UserDetailDrawer
        investor={drawerUser}
        open={drawerUser !== null}
        onClose={() => setDrawerUser(null)}
      />
    </PlatformAdminLayout>
  );
}

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
