"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import {
  Building2, User, Wallet, Shield, CheckCircle2, XCircle, Clock,
  ArrowLeft, Loader2, AlertTriangle, TrendingUp, Copy, ExternalLink,
  Globe,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { createPublicClient, type Abi } from "viem";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { getIssuer, activateIssuer, revokeIssuer, type Issuer } from "@/lib/api/repositories/issuers";
import { approveIssuerWallet, rejectIssuerWallet, skipIssuerIdentity } from "@/lib/api/repositories/issuer-onboarding";
import { getSales, type Sale } from "@/lib/api/repositories/sales";
import { formatCurrency, parseApiDate } from "@/lib/utils";
import { getAddresses } from "@/lib/contracts/addresses";
import { getChain, getTransport } from "@/lib/chain";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { useContractAction } from "@/hooks/useContractAction";
import { COUNTRIES } from "@/components/molecules/CountrySelector";

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    approved: { bg: "bg-green-50 border-green-200", text: "text-green-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    active: { bg: "bg-green-50 border-green-200", text: "text-green-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    pending: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <Clock className="h-3.5 w-3.5" /> },
    verified: { bg: "bg-teal-50 border-teal-200", text: "text-teal-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    pending_approval: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <Clock className="h-3.5 w-3.5" /> },
    rejected: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
    suspended: { bg: "bg-red-50 border-red-200", text: "text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
    none: { bg: "bg-zinc-50 border-zinc-200", text: "text-zinc-500", icon: <Clock className="h-3.5 w-3.5" /> },
  };
  const c = config[status] ?? config.none!;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${c!.bg} ${c!.text}`}>
      {c!.icon}
      {({ pending_approval: "Pending Approval", approved_coming_soon: "Coming Soon", finalized_success: "Completed", finalized_failed: "Failed" } as Record<string, string>)[status] || status.replace(/_/g, " ")}
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

  // On-chain registration state. We check both registries so the page can't
  // claim "fully activated" when the IR hasn't actually been whitelisted —
  // token deposit into a sale would revert otherwise.
  type ChainState = "checking" | "registered" | "needs_whitelist" | "not_registered" | "n/a";
  const [chainState, setChainState] = useState<ChainState>("checking");
  const issuerRegistryAddr = getAddresses().issuerRegistry;
  const platformIR = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const irWhitelistAction = useContractAction();

  const refreshChainState = useCallback(async () => {
    if (!issuer || !issuer.wallet_address || !issuerRegistryAddr) {
      setChainState("n/a"); return;
    }
    setChainState("checking");
    try {
      const client = createPublicClient({ chain: getChain(), transport: getTransport() });
      const isActive = await client.readContract({
        address: issuerRegistryAddr,
        abi: ISSUER_REGISTRY_ABI,
        functionName: "isActiveIssuer",
        args: [issuer.wallet_address as `0x${string}`],
      });
      if (!isActive) { setChainState("not_registered"); return; }
      if (!platformIR) { setChainState("registered"); return; }
      const isVerified = await client.readContract({
        address: platformIR,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI,
        functionName: "isVerified",
        args: [issuer.wallet_address as `0x${string}`],
      });
      setChainState(isVerified ? "registered" : "needs_whitelist");
    } catch {
      setChainState("not_registered");
    }
  }, [issuer, issuerRegistryAddr, platformIR]);

  useEffect(() => { refreshChainState(); }, [refreshChainState]);

  // Re-check after the whitelist tx confirms
  useEffect(() => {
    if (irWhitelistAction.isConfirmed) {
      refreshChainState();
      irWhitelistAction.reset();
    }
  }, [irWhitelistAction.isConfirmed, refreshChainState]);

  const handleAddToIRWhitelist = async () => {
    if (!issuer?.wallet_address || !platformIR) return;
    if (!isConnected) { openConnectModal?.(); return; }
    const jur = issuer.jurisdiction ?? "";
    const countryEntry = COUNTRIES.find(c => c.name.toLowerCase() === jur.toLowerCase());
    const countryCode: number = countryEntry?.code ?? 0;
    try {
      await irWhitelistAction.execute({
        address: platformIR,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
        functionName: "addToWhitelist",
        args: [issuer.wallet_address as `0x${string}`, countryCode],
        gas: 200_000n,
      });
    } catch {
      /* surface via the inline tx-status panel */
    }
  };

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

  const totalRaised = sales.reduce((s, x) => s + parseFloat(x.total_raised || "0"), 0);

  return (
    <PlatformAdminLayout title={issuer.name}>
      <div className="mb-6">
        <Link href="/platform/issuers" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Issuers
        </Link>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-darkAqua/20 to-darkAqua/5 flex items-center justify-center">
              {issuer.issuer_type === "corporate"
                ? <Building2 className="h-6 w-6 text-darkAqua" />
                : <User className="h-6 w-6 text-darkAqua" />
              }
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">{issuer.name}</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {issuer.slug} {issuer.legal_entity_name ? `· ${issuer.legal_entity_name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm" className="capitalize">{issuer.issuer_type}</Badge>
            <StatusPill status={issuer.status} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-zinc-100">
          {[
            { label: "Jurisdiction", value: issuer.jurisdiction ?? "—" },
            { label: "Fee", value: `${issuer.fee_bps / 100}%` },
            { label: "Sales", value: sales.length.toString() },
            { label: "Total Raised", value: formatCurrency(totalRaised) },
            { label: "Created", value: parseApiDate(issuer.created_at).toLocaleDateString() },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">{item.label}</p>
              <p className="text-sm font-medium text-text mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Three Gates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Wallet */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-blue-600" />
              </div>
              <h3 className="font-semibold text-sm">Wallet</h3>
            </div>
            <StatusPill status={issuer.wallet_status} />
          </div>
          {issuer.wallet_address ? (
            <button
              onClick={() => navigator.clipboard.writeText(issuer.wallet_address!)}
              className="w-full flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 p-3 rounded-lg mb-3 transition-colors cursor-pointer text-left"
            >
              <span className="text-xs font-mono text-zinc-600 truncate flex-1">{issuer.wallet_address}</span>
              <Copy className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            </button>
          ) : (
            <p className="text-xs text-zinc-400 mb-3 py-2">No wallet submitted yet</p>
          )}
          {issuer.wallet_status === "verified" && (
            <p className="text-[11px] text-zinc-400 mb-3">Ownership verified, awaiting admin approval.</p>
          )}
          {(issuer.wallet_status === "pending_approval" || issuer.wallet_status === "verified") && (
            <div className="flex gap-2">
              <Button variant="primary" size="sm" className="flex-1" onClick={() => handleAction("approve-wallet")}
                isLoading={actionLoading === "approve-wallet"}>
                Approve
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => handleAction("reject-wallet")} isLoading={actionLoading === "reject-wallet"}>
                Reject
              </Button>
            </div>
          )}
        </div>

        {/* Identity */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Shield className="h-4 w-4 text-purple-600" />
              </div>
              <h3 className="font-semibold text-sm">{issuer.issuer_type === "corporate" ? "KYB" : "KYC"}</h3>
            </div>
            <StatusPill status={issuer.identity_status} />
          </div>
          <div className="text-xs text-zinc-500 space-y-1.5 mb-3">
            <p>Type: <span className="font-medium text-text capitalize">{issuer.issuer_type}</span></p>
            {issuer.identity_verified_at && (
              <p>Verified: <span className="font-medium text-text">{parseApiDate(issuer.identity_verified_at).toLocaleDateString()}</span></p>
            )}
            {issuer.identity_status === "none" && <p className="text-zinc-400">Not started</p>}
            {issuer.identity_status === "pending" && <p className="text-amber-600">Under review</p>}
            {issuer.identity_status === "rejected" && <p className="text-red-600">Rejected</p>}
          </div>
          {issuer.identity_status !== "approved" && (
            <Button variant="outline" size="sm" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => handleAction("skip-identity")} isLoading={actionLoading === "skip-identity"}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Skip Verification
            </Button>
          )}
        </div>

        {/* Activation */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${issuer.status === "active" ? "bg-green-50" : "bg-zinc-100"}`}>
                <CheckCircle2 className={`h-4 w-4 ${issuer.status === "active" ? "text-green-600" : "text-zinc-400"}`} />
              </div>
              <h3 className="font-semibold text-sm">Activation</h3>
            </div>
            <StatusPill status={issuer.status} />
          </div>

          {issuer.status === "active" ? (
            <div className="space-y-3">
              {/* On-chain truth — DB flag alone is misleading because token deposits
                  into a sale require the issuer wallet to also be on the IR whitelist. */}
              {chainState === "checking" ? (
                <p className="text-xs text-zinc-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking on-chain registration…
                </p>
              ) : chainState === "registered" ? (
                <p className="text-xs text-green-600 font-medium">
                  Fully activated and registered on-chain. Can deploy tokens, create sales, and deposit tokens for sale.
                </p>
              ) : chainState === "needs_whitelist" ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 font-medium flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      DB-active but missing Identity Registry whitelist. Token deploy works, but
                      depositing tokens into a sale will revert until this wallet is whitelisted on the IR.
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleAddToIRWhitelist}
                    isLoading={irWhitelistAction.isPending || irWhitelistAction.isConfirming}
                    leftIcon={<Globe className="h-4 w-4" />}
                  >
                    {irWhitelistAction.isPending
                      ? "Confirm in wallet…"
                      : irWhitelistAction.isConfirming
                        ? "Whitelisting…"
                        : "Add to Identity Registry"}
                  </Button>
                </div>
              ) : chainState === "not_registered" ? (
                <p className="text-xs text-amber-700 font-medium flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Active in DB but not registered on-chain. Use the Issuers list (Register On-Chain) before tokens or sales can deploy.
                  </span>
                </p>
              ) : null}
              <Button variant="outline" size="sm" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={() => handleAction("revoke")} isLoading={actionLoading === "revoke"}>
                Suspend Issuer
              </Button>
            </div>
          ) : issuer.status === "suspended" ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-700 font-medium">Issuer is suspended. They can&apos;t deploy tokens or create sales until reactivated.</p>
              <Button variant="primary" size="sm" className="w-full"
                disabled={!canActivate}
                onClick={() => handleAction("activate")} isLoading={actionLoading === "activate"}>
                {canActivate ? "Reactivate Issuer" : "Cannot Reactivate Yet"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {!walletApproved && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Wallet not approved</p>
              )}
              {!identityApproved && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Identity not verified</p>
              )}
              {canActivate && (
                <p className="text-[11px] text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ready to activate</p>
              )}
              <Button variant="primary" size="sm" className="w-full" disabled={!canActivate}
                onClick={() => handleAction("activate")} isLoading={actionLoading === "activate"}>
                {canActivate ? "Activate Issuer" : "Cannot Activate Yet"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sales */}
      <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <h3 className="font-semibold text-sm">Token Sales</h3>
          </div>
          <span className="text-xs text-zinc-400">{sales.length} sale{sales.length !== 1 ? "s" : ""}</span>
        </div>
        {sales.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-sm">No sales created yet</div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {sales.map((sale) => {
              const raised = parseFloat(sale.total_raised || "0");
              const hardCap = parseFloat(sale.hard_cap || "0");
              const pct = hardCap > 0 ? Math.min(Math.round((raised / hardCap) * 100), 100) : 0;
              return (
                <Link key={sale.id} href={`/platform/sales/${sale.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{sale.title || sale.token_name || "Untitled"}</p>
                    <p className="text-xs text-zinc-400">{sale.token_symbol || ""}</p>
                  </div>
                  <StatusPill status={sale.status} />
                  <div className="text-right shrink-0 w-24">
                    <p className="text-sm font-medium">{formatCurrency(raised)}</p>
                    <p className="text-[10px] text-zinc-400">{hardCap > 0 ? `of ${formatCurrency(hardCap)}` : "no cap"}</p>
                  </div>
                  <div className="w-20 shrink-0">
                    <ProgressBar value={pct} size="sm" />
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-300 group-hover:text-darkAqua transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PlatformAdminLayout>
  );
}
