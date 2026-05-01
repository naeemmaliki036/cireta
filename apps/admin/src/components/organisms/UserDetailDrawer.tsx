"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/atoms";
import type { Investor, Holding, BeneficialOwner } from "@/lib/api/repositories/buyers";
import { resolveCountry } from "@/lib/countries";

interface UserDetailDrawerProps {
  investor: Investor | null;
  open: boolean;
  onClose: () => void;
}

type Row = {
  label: string;
  self: string | null;
  verified: string | null;
};

function fmtCountry(v: string | null): string | null {
  if (!v) return null;
  const c = resolveCountry(v);
  return c ? `${c.name} · ${v}` : v;
}

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function UserDetailDrawer({ investor, open, onClose }: UserDetailDrawerProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !investor) return null;

  const isCorporate = investor.investor_type === "corporate";
  const u = investor;

  // Dual-source profile rows
  const personalRows: Row[] = [
    { label: "Full name", self: u.display_name, verified: u.verified_full_name },
    { label: "Date of birth", self: u.date_of_birth, verified: u.verified_date_of_birth },
    { label: "Phone", self: u.phone_number, verified: u.verified_phone_number },
    { label: "Nationality", self: fmtCountry(u.nationality), verified: fmtCountry(u.verified_nationality) },
    { label: "Country of residence", self: fmtCountry(u.country_of_residence), verified: fmtCountry(u.verified_country_of_residence) },
  ];

  const corporateRows: Row[] = [
    { label: "Company name", self: u.company_name, verified: u.verified_company_name },
    { label: "Registration #", self: u.company_registration_number, verified: u.verified_company_registration_number },
    { label: "Jurisdiction", self: fmtCountry(u.company_jurisdiction), verified: fmtCountry(u.verified_company_jurisdiction) },
  ];

  const rows = isCorporate ? corporateRows : personalRows;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed top-0 right-0 z-50 h-full w-full max-w-[600px] bg-white shadow-2xl overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-zinc-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-zinc-900 truncate">
                {u.verified_full_name || u.display_name || u.email.split("@")[0]}
              </h2>
              <Badge
                variant={isCorporate ? "success" : "default"}
                size="sm"
              >
                {u.investor_type ?? "individual"}
              </Badge>
              <Badge
                variant={
                  u.kyc_status === "approved" ? "success"
                    : u.kyc_status === "pending" ? "pending"
                    : u.kyc_status === "rejected" ? "error"
                    : "default"
                }
                size="sm"
              >
                KYC: {u.kyc_status}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{u.email}</p>
            {u.kyc_synced_at && (
              <p className="text-[10px] text-zinc-400 mt-1">
                Last KYC sync: {new Date(u.kyc_synced_at).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Profile — dual-source comparison */}
          <section>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Profile {isCorporate ? "(Corporate)" : "(Individual)"}
            </h3>
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 bg-[#ECF3F4] text-[11px] font-medium text-zinc-600 px-3 py-2">
                <div className="col-span-3">Field</div>
                <div className="col-span-4">Self-reported</div>
                <div className="col-span-4">Sumsub-verified</div>
                <div className="col-span-1 text-center">Match</div>
              </div>
              {rows.map((r) => {
                const both = !!r.self && !!r.verified;
                const match = both && r.self === r.verified;
                return (
                  <div key={r.label} className="grid grid-cols-12 items-center px-3 py-2 text-xs border-t border-zinc-100">
                    <div className="col-span-3 text-zinc-500">{r.label}</div>
                    <div className="col-span-4 text-zinc-900 truncate" title={r.self ?? ""}>
                      {r.self || <span className="text-zinc-300">—</span>}
                    </div>
                    <div className="col-span-4 text-zinc-900 truncate" title={r.verified ?? ""}>
                      {r.verified || <span className="text-zinc-300">—</span>}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {!both ? (
                        <span className="text-zinc-300">—</span>
                      ) : match ? (
                        <Check className="h-3.5 w-3.5 text-green-600" aria-label="Match" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Mismatch" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Beneficial owners (KYB) */}
            {isCorporate && u.verified_beneficial_owners && u.verified_beneficial_owners.length > 0 && (
              <div className="mt-3 border border-zinc-200 rounded-lg overflow-hidden">
                <div className="bg-[#ECF3F4] text-[11px] font-medium text-zinc-600 px-3 py-2">
                  Beneficial owners ({u.verified_beneficial_owners.length})
                </div>
                <ul className="divide-y divide-zinc-100">
                  {u.verified_beneficial_owners.map((b: BeneficialOwner, i: number) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="text-zinc-900">{b.name}</span>
                      {b.ownership_pct && (
                        <span className="font-mono text-zinc-500 tabular-nums">{b.ownership_pct}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Wallets */}
          <section>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Wallets ({u.wallet_count})
            </h3>
            {u.wallet_count === 0 ? (
              <p className="text-xs text-zinc-400 italic">No wallets linked.</p>
            ) : u.wallet_address ? (
              <div className="border border-zinc-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-900">{u.wallet_address}</span>
                <button
                  onClick={() => copy(u.wallet_address ?? "")}
                  className="p-1 rounded hover:bg-zinc-100 text-zinc-500"
                  aria-label="Copy"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            {u.wallet_count > 1 && (
              <p className="text-[11px] text-zinc-400 mt-1">
                Open the full profile to manage all {u.wallet_count} wallets.
              </p>
            )}
          </section>

          {/* Participation */}
          <section>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              Participation ({u.participation_count})
            </h3>
            {u.top_holdings.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">Not active in any sale yet.</p>
            ) : (
              <HoldingsTable holdings={u.top_holdings} />
            )}
            <p className="text-[11px] text-zinc-400 mt-1">
              Total contributed: <span className="font-mono tabular-nums">{u.total_contributed_usdc} USDC</span>
            </p>
          </section>

          {/* Footer link */}
          <div className="pt-2 border-t border-zinc-100">
            <Link
              href={`/platform/users/${u.id}`}
              className="inline-flex items-center gap-1 text-sm text-[#13636F] hover:underline"
            >
              Open full profile (KYC actions, wallets, audit) <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-12 bg-[#ECF3F4] text-[11px] font-medium text-zinc-600 px-3 py-2">
        <div className="col-span-5">Sale</div>
        <div className="col-span-3 text-right">Tokens held</div>
        <div className="col-span-2 text-right">Paid</div>
        <div className="col-span-2 text-right">Status</div>
      </div>
      <ul className="divide-y divide-zinc-100">
        {holdings.map((h) => (
          <li key={h.sale_id} className="grid grid-cols-12 items-center px-3 py-2 text-xs">
            <div className="col-span-5 truncate text-zinc-900" title={h.sale_name}>
              <span className="font-medium">{h.token_symbol ?? "—"}</span>
              <span className="text-zinc-400 ml-2">{h.sale_name}</span>
            </div>
            <div className="col-span-3 text-right font-mono tabular-nums text-zinc-700">{h.tokens_held}</div>
            <div className="col-span-2 text-right font-mono tabular-nums text-zinc-700">{h.contributed_usdc}</div>
            <div className="col-span-2 text-right">
              <Badge
                variant={h.claim_status === "claimed" ? "success" : h.claim_status === "refunded" ? "error" : "pending"}
                size="sm"
              >
                {h.claim_status}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
