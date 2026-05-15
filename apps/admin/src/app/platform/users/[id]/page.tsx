"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  ShieldCheck,
  Wallet,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  Shield,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { CountrySelect } from "@/components/molecules/CountrySelect";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { PlatformAdminLayout } from "@/components/templates";
import { resolveCountry } from "@/lib/countries";
import {
  getInvestor,
  updateInvestorKYC,
  checkSumsubStatus,
  confirmSumsubSync,
  type InvestorDetail,
  type SumsubCheckResponse,
} from "@/lib/api/repositories/buyers";
import { markWalletRegistered } from "@/lib/api/repositories/admin-wallets";
import { apiFetch } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    approved: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    pending: { color: "bg-amber-100 text-amber-700", icon: Clock },
    rejected: { color: "bg-red-100 text-red-700", icon: XCircle },
    none: { color: "bg-zinc-100 text-zinc-500", icon: XCircle },
    expired: { color: "bg-red-100 text-red-700", icon: XCircle },
  };
  const c = config[status] ?? config.none!;
  const Icon = c!.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold ${c!.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}


export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<InvestorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // KYC actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sumsubCheck, setSumsubCheck] = useState<SumsubCheckResponse | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const whitelistRegistryAddress = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS || "";
  const [whitelistCountryCode, setWhitelistCountryCode] = useState("840"); // US default
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);

  // Country update (per-user batch)
  const [updateCountryCode, setUpdateCountryCode] = useState<string>("");
  const [updateScope, setUpdateScope] = useState<"all" | "selected">("all");
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());
  const [updateProgress, setUpdateProgress] = useState<{ done: number; total: number; failures: string[] } | null>(null);

  // On-chain whitelisting
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const whitelistAction = useContractAction();
  const updateCountryAction = useContractAction();

  const reload = async () => {
    try {
      const data = await getInvestor(id);
      setUser(data);
    } catch { /* ignore */ }
  };

  // Pre-select the on-chain whitelisting country to whatever we know about
  // where the user is based — verified beats self-reported. For Individuals
  // that's country_of_residence; for Corporate it's the company jurisdiction.
  // Stored values may be alpha-2, alpha-3, or already-numeric; resolveCountry
  // handles all three.
  const applyResidenceDefault = (u: InvestorDetail) => {
    const isCorporate = u.investor_type === "corporate";
    const value = isCorporate
      ? (u.verified_company_jurisdiction || u.company_jurisdiction)
      : (u.verified_country_of_residence || u.country_of_residence);
    const c = resolveCountry(value);
    if (c) setWhitelistCountryCode(String(c.numeric));
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestor(id);
        setUser(data);
        applyResidenceDefault(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleKYCAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    setActionMessage(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Action failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = () => handleKYCAction("approve", async () => {
    const result = await updateInvestorKYC(id, "approved");
    const onchain = result.onchain_registration ?? "";
    const onchainFailed = onchain.startsWith("failed");
    setActionMessage({
      type: onchainFailed ? "error" : "success",
      text: onchainFailed
        ? `KYC approved BUT on-chain registration failed — use 'Resync IR' below to retry. Detail: ${onchain.replace(/^failed:\s*/, "").slice(0, 200)}`
        : "KYC approved. Wallets registered on-chain.",
    });
  });

  const handleReject = () => handleKYCAction("reject", async () => {
    await updateInvestorKYC(id, "rejected", rejectReason || undefined);
    setActionMessage({ type: "success", text: "KYC rejected" });
    setShowRejectForm(false);
    setRejectReason("");
  });

  const handleReset = () => handleKYCAction("reset", async () => {
    await updateInvestorKYC(id, "none");
    setActionMessage({ type: "success", text: "KYC status reset" });
  });

  const handleCheckSumsub = () => handleKYCAction("check", async () => {
    const result = await checkSumsubStatus(id);
    setSumsubCheck(result);
    if (!result.out_of_sync) {
      setActionMessage({ type: "success", text: result.message });
    }
  });

  const handleConfirmSync = () => handleKYCAction("confirm-sync", async () => {
    const result = await confirmSumsubSync(id);
    setSumsubCheck(null);
    setActionMessage({
      type: "success",
      text: `${result.message}${result.notification_sent ? " — user notified" : ""}`,
    });
  });

  const handleWhitelistOnChain = async (w: { id: string; address: string }) => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!whitelistRegistryAddress) {
      setActionMessage({ type: "error", text: "Identity registry address not configured." });
      return;
    }
    const countryCode = parseInt(whitelistCountryCode, 10) || 840;
    const receipt = await whitelistAction.execute({
      address: whitelistRegistryAddress as `0x${string}`,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "addToWhitelist",
      args: [w.address as `0x${string}`, countryCode],
    });
    if (receipt) {
      try {
        await markWalletRegistered(w.id, receipt.transactionHash);
        await reload();
      } catch {
        // non-blocking — admin can still click Refresh on the Wallet Registry page
      }
    }
  };

  // Sequential per-wallet updateCountry — the contract has no batch version,
  // so we send one tx per wallet and surface progress as we go.
  const handleUpdateCountryAcrossWallets = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!whitelistRegistryAddress || !user) return;
    const code = parseInt(updateCountryCode, 10);
    if (!code) {
      setActionMessage({ type: "error", text: "Pick a country first." });
      return;
    }
    const targets = updateScope === "all"
      ? user.wallets
      : user.wallets.filter((w) => selectedWalletIds.has(w.id));
    if (targets.length === 0) {
      setActionMessage({ type: "error", text: "Select at least one wallet." });
      return;
    }
    setUpdateProgress({ done: 0, total: targets.length, failures: [] });
    let done = 0;
    const failures: string[] = [];
    for (const w of targets) {
      try {
        const receipt = await updateCountryAction.execute({
          address: whitelistRegistryAddress as `0x${string}`,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
          functionName: "updateCountry",
          args: [w.address as `0x${string}`, code],
        });
        // updateCountry only succeeds on already-whitelisted wallets, so a
        // successful receipt is proof the wallet is on-chain. Sync the DB.
        if (receipt) {
          try {
            await markWalletRegistered(w.id, receipt.transactionHash);
          } catch {
            // non-blocking — admin can refresh manually
          }
        }
      } catch (e) {
        failures.push(`${w.address.slice(0, 6)}…${w.address.slice(-4)}: ${e instanceof Error ? e.message : "failed"}`);
      }
      done += 1;
      setUpdateProgress({ done, total: targets.length, failures: [...failures] });
    }
    setActionMessage(failures.length === 0
      ? { type: "success", text: `Updated country on ${targets.length} wallet(s).` }
      : { type: "error", text: `${targets.length - failures.length} succeeded, ${failures.length} failed.` }
    );
    await reload();
  };

  if (loading) {
    return (
      <PlatformAdminLayout title="User Details" description="">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      </PlatformAdminLayout>
    );
  }

  if (error || !user) {
    return (
      <PlatformAdminLayout title="User Details" description="">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-600">{error ?? "User not found"}</p>
          <Link href="/platform/users">
            <Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Users</Button>
          </Link>
        </div>
      </PlatformAdminLayout>
    );
  }

  const identityMode = (process.env.NEXT_PUBLIC_IDENTITY_MODE ?? "simple") as "simple" | "erc3643";
  const isIndividual = user.investor_type === "individual" || !user.investor_type;
  const isApproved = user.kyc_status === "approved";
  const hasWallets = user.wallets.length > 0;

  // Onboarding completion gate depends on identity mode.
  // In simple mode: email verified + KYC approved + at least one wallet linked.
  // In erc3643 mode: additionally requires an on-chain ONCHAINID.
  const isOnboardingComplete = identityMode === "simple"
    ? (user.email_verified && isApproved && hasWallets)
    : (user.email_verified && isApproved && hasWallets && !!user.onchain_id);

  // Compute whitelist country mismatch once for the whole render — the
  // banner needs it AND the per-wallet shield buttons need to be gated by
  // the same consent. (verified beats self-reported per the audit overhaul.)
  const expectedCountrySource = isIndividual
    ? (user.verified_country_of_residence || user.country_of_residence)
    : (user.verified_company_jurisdiction || user.company_jurisdiction);
  const expectedCountry = resolveCountry(expectedCountrySource);
  const selectedCountry = whitelistCountryCode ? resolveCountry(Number(whitelistCountryCode)) : null;
  const countryMismatch = !!(
    expectedCountry && selectedCountry && expectedCountry.numeric !== selectedCountry.numeric
  );
  const whitelistBlocked = countryMismatch && !mismatchAcknowledged;

  return (
    <PlatformAdminLayout
      title={user.display_name || user.email}
      description={user.email}
    >
      {/* Back link */}
      <div className="mb-6">
        <Link href="/platform/users" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
      </div>

      {/* Action messages */}
      {actionMessage && (
        <div className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-2 ${actionMessage.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>
          {actionMessage.type === "error" ? <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-darkAqua/10 flex items-center justify-center">
              {isIndividual
                ? <User className="h-7 w-7 text-darkAqua" />
                : <Building2 className="h-7 w-7 text-darkAqua" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">{user.display_name || user.email.split("@")[0]}</h2>
              <p className="text-sm text-zinc-500">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={user.investor_type ? "default" : "outline"} size="sm">
                  {user.investor_type ?? "Not set"}
                </Badge>
                {user.is_accredited && <Badge variant="success" size="sm">Accredited</Badge>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>ID: {user.id.slice(0, 8)}...</span>
            <span>Joined {user.created_at.slice(0, 10)}</span>
          </div>
        </div>
      </div>

      {/* KYC Admin Actions */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-400" /> KYC Management
          </h3>
          <StatusPill status={user.kyc_status} />
        </div>

        {/* KYC Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5 text-sm">
          <div className="bg-zinc-50 rounded-lg p-3">
            <p className="text-zinc-400 text-xs">Level</p>
            <p className="font-bold">{user.kyc_level}</p>
          </div>
          <div className="bg-zinc-50 rounded-lg p-3">
            <p className="text-zinc-400 text-xs">Provider</p>
            <p className="font-bold">{user.kyc_provider ?? "—"}</p>
          </div>
          <div className="bg-zinc-50 rounded-lg p-3">
            <p className="text-zinc-400 text-xs">Verified at</p>
            <p className="font-bold">{user.kyc_verified_at ? user.kyc_verified_at.slice(0, 10) : "—"}</p>
          </div>
          {identityMode !== "simple" && (
            <div className="bg-zinc-50 rounded-lg p-3">
              <p className="text-zinc-400 text-xs">On-chain ID</p>
              {user.onchain_id ? <CopyableAddress address={user.onchain_id} truncate className="text-xs font-bold" /> : <p className="text-xs font-bold">—</p>}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {!isApproved && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleApprove}
              isLoading={actionLoading === "approve"}
              disabled={!!actionLoading}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Approve KYC
            </Button>
          )}
          {!showRejectForm && user.kyc_status !== "rejected" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRejectForm(true)}
              disabled={!!actionLoading}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
          )}
          {user.kyc_status !== "none" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              isLoading={actionLoading === "reset"}
              disabled={!!actionLoading}
            >
              Reset to None
            </Button>
          )}

          <div className="h-6 w-px bg-zinc-200 mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckSumsub}
            isLoading={actionLoading === "check"}
            disabled={!!actionLoading}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Check Sumsub Status
          </Button>

        </div>

        {/* Reject reason form */}
        {showRejectForm && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 rounded-lg border border-red-100">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="flex-1 px-3 py-2 rounded-lg border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <Button variant="primary" size="sm" onClick={handleReject} isLoading={actionLoading === "reject"} className="bg-red-600 hover:bg-red-700">
              Confirm Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowRejectForm(false); setRejectReason(""); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* Sumsub check result */}
        {sumsubCheck && (
          <div className={`p-4 rounded-lg border text-sm ${sumsubCheck.out_of_sync ? "bg-amber-50 border-amber-300" : "bg-green-50 border-green-200"}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <p className="text-xs text-zinc-400">Sumsub Status</p>
                <p className="font-medium">{sumsubCheck.sumsub_status ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Sumsub Answer</p>
                <p className={`font-bold ${sumsubCheck.review_answer === "GREEN" ? "text-green-600" : sumsubCheck.review_answer === "RED" ? "text-red-600" : "text-zinc-600"}`}>
                  {sumsubCheck.review_answer ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Database Status</p>
                <p className="font-medium">{sumsubCheck.db_status}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">Status</p>
                <p className={`font-bold ${sumsubCheck.out_of_sync ? "text-amber-600" : "text-green-600"}`}>
                  {sumsubCheck.out_of_sync ? "Out of Sync" : "In Sync"}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-600 mb-3">{sumsubCheck.message}</p>

            {sumsubCheck.out_of_sync && (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmSync}
                  isLoading={actionLoading === "confirm-sync"}
                  disabled={!!actionLoading}
                  className={sumsubCheck.suggested_action === "reject" ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  {sumsubCheck.suggested_action === "approve" ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Sync & Approve</>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 mr-1.5" /> Sync & Reject</>
                  )}
                </Button>
                <span className="text-xs text-zinc-400">This will update the database, register on-chain, and notify the user.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Email & Onboarding */}
        <div className="bg-white rounded-lg border border-zinc-100 p-6">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4">
            <Mail className="h-4 w-4 text-zinc-400" /> Account Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Email verified</span>
              <Badge variant={user.email_verified ? "success" : "error"} size="sm">
                {user.email_verified ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Onboarding</span>
              <Badge variant={isOnboardingComplete ? "success" : "default"} size="sm">
                {isOnboardingComplete ? "Complete" : "Incomplete"}
              </Badge>
            </div>
            {identityMode !== "simple" && (
              <div className="flex justify-between">
                <span className="text-zinc-400">On-chain ID</span>
                <span className="font-mono text-xs">{user.onchain_id ? `${user.onchain_id.slice(0, 8)}...` : "—"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Wallets */}
        <div className="bg-white rounded-lg border border-zinc-100 p-6">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4">
            <Wallet className="h-4 w-4 text-zinc-400" /> Wallets ({user.wallet_count})
          </h3>
          {user.wallets.length === 0 ? (
            <p className="text-sm text-zinc-400">No wallets connected</p>
          ) : (
            <div className="space-y-2">
              {user.wallets.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                  <CopyableAddress address={w.address} truncate className="text-xs text-zinc-700" />
                  <div className="flex items-center gap-2">
                    {w.is_primary && <Badge variant="success" size="sm">Primary</Badge>}
                    {isApproved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleWhitelistOnChain({ id: w.id, address: w.address })}
                        disabled={
                          whitelistAction.isPending ||
                          whitelistAction.isConfirming ||
                          !whitelistRegistryAddress ||
                          whitelistBlocked
                        }
                        title={
                          whitelistBlocked
                            ? "Tick the country-mismatch consent below before whitelisting"
                            : "Whitelist on-chain"
                        }
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {user.wallets.length > 5 && (
                <p className="text-xs text-zinc-400 text-center">+{user.wallets.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* On-Chain Whitelisting */}
      {isApproved && hasWallets && (
        <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-zinc-400" /> On-Chain Whitelisting
            </h3>
            <ResyncIRButton userId={user.id} onDone={reload} />
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Whitelist this buyer&apos;s wallet(s) on the platform&apos;s SimpleIdentityRegistry. Click the shield icon next to a wallet to whitelist it, or use{" "}
            <strong>Resync IR</strong> to re-fire <code>addToWhitelist</code> via the platform signer for any unregistered wallet.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-4">
            <div className="flex-1 w-full">
              <label className="block text-xs text-zinc-500 mb-1">Identity Registry</label>
              <div className="w-full px-3 py-2 rounded-lg border border-zinc-100 bg-zinc-50 text-sm font-mono text-zinc-600">
                {whitelistRegistryAddress}
              </div>
            </div>
            <div className="w-72">
              <label className="block text-xs text-zinc-500 mb-1">
                Country
                {expectedCountry && (
                  <span className="ml-1 text-zinc-400 font-normal">
                    (default: {expectedCountry.name})
                  </span>
                )}
              </label>
              <CountrySelect
                mode="numeric"
                value={whitelistCountryCode ? Number(whitelistCountryCode) : null}
                onChange={(v) => {
                  setWhitelistCountryCode(v === null ? "" : String(v));
                  setMismatchAcknowledged(false);
                }}
                placeholder="Select country"
              />
            </div>
          </div>

          {countryMismatch && (
            <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-semibold mb-0.5">Country code mismatch</p>
                  <p>
                    You selected <span className="font-medium">{selectedCountry?.name} ({selectedCountry?.numeric})</span>,
                    but this {isIndividual ? "user's residence" : "company's jurisdiction"} is{" "}
                    <span className="font-medium">{expectedCountry?.name} ({expectedCountry?.numeric})</span>.
                    Whitelisting with a different code can affect compliance-module checks (CountryAllow, MaxOwnership)
                    and the audit trail.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mismatchAcknowledged}
                  onChange={(e) => setMismatchAcknowledged(e.target.checked)}
                  className="rounded"
                />
                I understand the risk and want to proceed with this country code anyway.
              </label>
            </div>
          )}

          {whitelistBlocked && (
            <p className="text-xs text-amber-700 mb-3">
              Tick the consent box above before whitelisting.
            </p>
          )}

          <TransactionStatus
            isPending={whitelistAction.isPending}
            isConfirming={whitelistAction.isConfirming}
            isConfirmed={whitelistAction.isConfirmed}
            txHash={whitelistAction.txHash}
            txUrl={whitelistAction.txUrl}
            error={whitelistAction.error}
            successMessage="Wallet whitelisted on-chain successfully."
          />
        </div>
      )}

      {/* Update Country across this user's wallets — sequential per-wallet
          updateCountry txns. Contract has no batch primitive, so we loop
          and surface progress. */}
      {isApproved && hasWallets && (
        <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-zinc-400" /> Update Country On Wallets
          </h3>
          <p className="text-xs text-zinc-500 mb-3">
            Change the on-chain country code for one, several, or all of this buyer&apos;s already-whitelisted wallets.
            Each wallet is updated by a separate <code className="font-mono">updateCountry</code> transaction
            (the registry contract has no batch primitive).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">New country</label>
              <CountrySelect
                mode="numeric"
                value={updateCountryCode ? Number(updateCountryCode) : null}
                onChange={(v) => setUpdateCountryCode(v === null ? "" : String(v))}
                placeholder="Select country"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Apply to</label>
              <select
                value={updateScope}
                onChange={(e) => setUpdateScope(e.target.value as "all" | "selected")}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
              >
                <option value="all">All {user.wallets.length} wallets</option>
                <option value="selected">Selected wallets only</option>
              </select>
            </div>
          </div>

          {updateScope === "selected" && (
            <div className="mb-3 border border-zinc-200 rounded-lg divide-y divide-zinc-100 max-h-56 overflow-y-auto">
              {user.wallets.map((w) => (
                <label key={w.id} className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={selectedWalletIds.has(w.id)}
                    onChange={(e) => {
                      const next = new Set(selectedWalletIds);
                      if (e.target.checked) next.add(w.id);
                      else next.delete(w.id);
                      setSelectedWalletIds(next);
                    }}
                  />
                  <span className="font-mono text-zinc-700">{w.address}</span>
                  {w.is_primary && <Badge variant="success" size="sm">Primary</Badge>}
                </label>
              ))}
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleUpdateCountryAcrossWallets}
            disabled={
              updateCountryAction.isPending ||
              updateCountryAction.isConfirming ||
              !updateCountryCode ||
              (updateScope === "selected" && selectedWalletIds.size === 0)
            }
          >
            {updateCountryAction.isConfirming
              ? "Confirming on chain…"
              : updateCountryAction.isPending
              ? "Sign in your wallet…"
              : `Update country${
                  updateScope === "all"
                    ? ` on all ${user.wallets.length} wallets`
                    : ` on ${selectedWalletIds.size} selected wallet(s)`
                }`}
          </Button>

          {updateProgress && (
            <p className="mt-3 text-xs text-zinc-600">
              Progress: {updateProgress.done} / {updateProgress.total}
              {updateProgress.failures.length > 0 && (
                <span className="ml-2 text-red-600">— {updateProgress.failures.length} failed</span>
              )}
            </p>
          )}

          <TransactionStatus
            isPending={updateCountryAction.isPending}
            isConfirming={updateCountryAction.isConfirming}
            isConfirmed={updateCountryAction.isConfirmed}
            txHash={updateCountryAction.txHash}
            txUrl={updateCountryAction.txUrl}
            error={updateCountryAction.error}
            successMessage="Country updated."
          />
        </div>
      )}

      {/* Profile — dual-source comparison */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-900">
            Profile {isIndividual ? "(Individual)" : "(Corporate)"}
          </h3>
          {user.kyc_synced_at && (
            <span className="text-[11px] text-zinc-400">
              Last KYC sync: {new Date(user.kyc_synced_at).toLocaleString()}
            </span>
          )}
        </div>
        <DualSourceTable
          rows={
            isIndividual
              ? [
                  { label: "Full name", self: user.display_name, verified: user.verified_full_name },
                  { label: "Date of birth", self: user.date_of_birth, verified: user.verified_date_of_birth },
                  { label: "Phone", self: user.phone_number, verified: user.verified_phone_number },
                  { label: "Nationality", self: fmtCountry(user.nationality), verified: fmtCountry(user.verified_nationality) },
                  { label: "Country of residence", self: fmtCountry(user.country_of_residence), verified: fmtCountry(user.verified_country_of_residence) },
                ]
              : [
                  { label: "Company name", self: user.company_name, verified: user.verified_company_name },
                  { label: "Registration #", self: user.company_registration_number, verified: user.verified_company_registration_number },
                  { label: "Jurisdiction", self: fmtCountry(user.company_jurisdiction), verified: fmtCountry(user.verified_company_jurisdiction) },
                ]
          }
        />

        {/* KYB beneficial owners */}
        {!isIndividual && user.verified_beneficial_owners && user.verified_beneficial_owners.length > 0 && (
          <div className="mt-4 border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-[#ECF3F4] text-[11px] font-medium text-zinc-600 px-3 py-2">
              Beneficial owners ({user.verified_beneficial_owners.length})
            </div>
            <ul className="divide-y divide-zinc-100">
              {user.verified_beneficial_owners.map((b, i) => (
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
      </div>
    </PlatformAdminLayout>
  );
}

interface ResyncResultItem {
  email: string;
  wallet_address: string;
  outcome: "already_on_chain" | "registered" | "failed";
  tx_hash?: string | null;
  error?: string | null;
}
interface ResyncResponse {
  scanned: number;
  already_on_chain: number;
  registered: number;
  failed: number;
  items: ResyncResultItem[];
}

function ResyncIRButton({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResyncResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const res = await apiFetch<ResyncResponse>(
        `/api/v1/admin/identity-registry/backfill?user_id=${userId}`,
        { method: "POST" },
      );
      setResult(res);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Resync failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={run} isLoading={running} disabled={running}>
        Resync IR
      </Button>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      {result && (
        <p className="text-[11px] text-zinc-500">
          {result.registered > 0 && <span className="text-darkAqua font-medium">{result.registered} registered</span>}
          {result.registered > 0 && result.already_on_chain > 0 && " · "}
          {result.already_on_chain > 0 && <span className="text-green-700">{result.already_on_chain} already on-chain</span>}
          {result.failed > 0 && <span className="text-red-600"> · {result.failed} failed</span>}
          {result.scanned === 0 && <span>No wallets to sync</span>}
        </p>
      )}
    </div>
  );
}

function fmtCountry(v: string | null): string | null {
  if (!v) return null;
  const c = resolveCountry(v);
  return c ? `${c.name} · ${v}` : v;
}

function DualSourceTable({
  rows,
}: {
  rows: { label: string; self: string | null; verified: string | null }[];
}) {
  return (
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
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-label="Match" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Mismatch" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
