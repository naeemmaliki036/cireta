"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  Building2, User, Wallet, Shield, CheckCircle2, XCircle, Clock,
  ArrowLeft, Loader2, AlertTriangle, TrendingUp,
} from "lucide-react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { getIssuer, activateIssuer, revokeIssuer, type Issuer } from "@/lib/api/repositories/issuers";
import { approveIssuerWallet, rejectIssuerWallet, skipIssuerIdentity } from "@/lib/api/repositories/issuer-onboarding";
import { getSales, type Sale } from "@/lib/api/repositories/sales";

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    approved: { bg: "bg-green-50", text: "text-green-700", icon: <CheckCircle2 className="h-4 w-4" /> },
    active: { bg: "bg-green-50", text: "text-green-700", icon: <CheckCircle2 className="h-4 w-4" /> },
    pending: { bg: "bg-amber-50", text: "text-amber-700", icon: <Clock className="h-4 w-4" /> },
    pending_approval: { bg: "bg-amber-50", text: "text-amber-700", icon: <Clock className="h-4 w-4" /> },
    rejected: { bg: "bg-red-50", text: "text-red-700", icon: <XCircle className="h-4 w-4" /> },
    suspended: { bg: "bg-red-50", text: "text-red-700", icon: <XCircle className="h-4 w-4" /> },
    none: { bg: "bg-zinc-100", text: "text-zinc-500", icon: <Clock className="h-4 w-4" /> },
  };
  const c = config[status] ?? config.none!;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c!.bg} ${c!.text}`}>
      {c!.icon}
      {status.replace("_", " ")}
    </span>
  );
}

export default function IssuerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [issuer, setIssuer] = useState<Issuer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchIssuer = async () => {
    try {
      const data = await getIssuer(id);
      setIssuer(data);
    } catch { setError("Failed to load issuer"); }
    finally { setLoading(false); }
  };

  const fetchSales = async () => {
    try {
      const data = await getSales(1, 50);
      setSales(data.items.filter((s) => s.issuer_id === id));
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchIssuer(); fetchSales(); }, [id]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    setError("");
    try {
      if (action === "approve-wallet") await approveIssuerWallet(id);
      else if (action === "reject-wallet") await rejectIssuerWallet(id);
      else if (action === "skip-identity") await skipIssuerIdentity(id);
      else if (action === "activate") await activateIssuer(id, "");
      else if (action === "revoke") await revokeIssuer(id, "");
      await fetchIssuer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const walletApproved = issuer?.wallet_status === "approved";
  const identityApproved = issuer?.identity_status === "approved";
  const canActivate = walletApproved && identityApproved && issuer?.status !== "active";

  if (loading) {
    return (
      <PlatformAdminLayout title="Issuer Details">
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 text-zinc-400 animate-spin" /></div>
      </PlatformAdminLayout>
    );
  }

  if (!issuer) {
    return (
      <PlatformAdminLayout title="Issuer Not Found">
        <p className="text-zinc-500">Issuer not found.</p>
      </PlatformAdminLayout>
    );
  }

  return (
    <PlatformAdminLayout
      title={issuer.name}
      breadcrumbs={[{ label: "Issuers", href: "/platform/issuers" }, { label: issuer.name }]}
    >
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Header Info */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-teal-50 flex items-center justify-center">
              {issuer.issuer_type === "corporate"
                ? <Building2 className="h-7 w-7 text-teal-600" />
                : <User className="h-7 w-7 text-teal-600" />
              }
            </div>
            <div>
              <h2 className="text-xl font-semibold">{issuer.name}</h2>
              <p className="text-sm text-zinc-500">{issuer.slug} &middot; {issuer.legal_entity_name ?? "No legal entity"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm" className="capitalize">{issuer.issuer_type}</Badge>
            <StatusPill status={issuer.status} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div><span className="text-zinc-400">Jurisdiction</span><p className="font-medium">{issuer.jurisdiction ?? "—"}</p></div>
          <div><span className="text-zinc-400">Fee</span><p className="font-medium">{issuer.fee_bps / 100}%</p></div>
          <div><span className="text-zinc-400">Created</span><p className="font-medium">{new Date(issuer.created_at).toLocaleDateString()}</p></div>
          <div><span className="text-zinc-400">User ID</span><p className="font-medium font-mono text-xs">{issuer.user_id.slice(0, 8)}...</p></div>
        </div>
      </div>

      {/* Three Gate Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Wallet */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-zinc-400" />
              <h3 className="font-semibold">Wallet</h3>
            </div>
            <StatusPill status={issuer.wallet_status} />
          </div>
          {issuer.wallet_address ? (
            <p className="text-xs font-mono bg-zinc-50 p-3 rounded-lg break-all mb-4">{issuer.wallet_address}</p>
          ) : (
            <p className="text-sm text-zinc-400 mb-4">No wallet submitted yet</p>
          )}
          {issuer.wallet_status === "pending_approval" && (
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => handleAction("approve-wallet")}
                isLoading={actionLoading === "approve-wallet"}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => handleAction("reject-wallet")}
                isLoading={actionLoading === "reject-wallet"}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-zinc-400" />
              <h3 className="font-semibold">{issuer.issuer_type === "corporate" ? "KYB" : "KYC"}</h3>
            </div>
            <StatusPill status={issuer.identity_status} />
          </div>
          <div className="text-sm text-zinc-500 space-y-1">
            <p>Type: <span className="font-medium text-zinc-700 capitalize">{issuer.issuer_type}</span></p>
            {issuer.identity_verified_at && (
              <p>Verified: <span className="font-medium text-zinc-700">{new Date(issuer.identity_verified_at).toLocaleString()}</span></p>
            )}
            {issuer.identity_status === "none" && <p className="text-zinc-400">Issuer has not started verification</p>}
            {issuer.identity_status === "pending" && <p className="text-amber-600">Under review by Sumsub</p>}
            {issuer.identity_status === "rejected" && <p className="text-red-600">Verification was rejected</p>}
          </div>
          {issuer.identity_status !== "approved" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4 text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => handleAction("skip-identity")}
              isLoading={actionLoading === "skip-identity"}
            >
              <Shield className="h-4 w-4 mr-1" /> Skip Verification
            </Button>
          )}
        </div>

        {/* Activation */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-zinc-400" />
              <h3 className="font-semibold">Activation</h3>
            </div>
            <StatusPill status={issuer.status} />
          </div>

          {issuer.status === "active" ? (
            <div className="space-y-3">
              <p className="text-sm text-green-600">Issuer is fully activated and can deploy tokens.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => handleAction("revoke")}
                isLoading={actionLoading === "revoke"}
              >
                Revoke Issuer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {!walletApproved && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Wallet not approved
                </p>
              )}
              {!identityApproved && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Identity not verified
                </p>
              )}
              {canActivate && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> All gates met — ready to activate
                </p>
              )}
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                disabled={!canActivate}
                onClick={() => handleAction("activate")}
                isLoading={actionLoading === "activate"}
              >
                {canActivate ? "Activate Issuer" : "Cannot Activate Yet"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sales */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-zinc-400" />
            <h3 className="font-semibold">Token Sales</h3>
          </div>
          <span className="text-sm text-zinc-400">{sales.length} sale{sales.length !== 1 ? "s" : ""}</span>
        </div>
        {sales.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-sm">No sales created yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-6 py-3">Token</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Raised</th>
                <th className="px-6 py-3">Hard Cap</th>
                <th className="px-6 py-3">Progress</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const raised = parseFloat(sale.total_raised || "0");
                const hardCap = parseFloat(sale.hard_cap || "0");
                const pct = hardCap > 0 ? (raised / hardCap) * 100 : 0;
                return (
                  <tr key={sale.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium">{sale.token_name ?? "—"}</p>
                      <p className="text-xs text-zinc-400">{sale.token_symbol}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill status={sale.status} />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">${raised.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">${hardCap.toLocaleString()}</td>
                    <td className="px-6 py-4 w-32">
                      <ProgressBar value={pct} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Link href="/platform/issuers">
        <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Issuers</Button>
      </Link>
    </PlatformAdminLayout>
  );
}
