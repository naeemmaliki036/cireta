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
  Globe,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Flag,
  RefreshCw,
  AlertCircle,
  Shield,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { PlatformAdminLayout } from "@/components/templates";
import {
  getInvestor,
  updateInvestorKYC,
  checkSumsubStatus,
  confirmSumsubSync,
  type InvestorDetail,
  type SumsubCheckResponse,
} from "@/lib/api/repositories/buyers";
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

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: typeof Mail }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-50 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-zinc-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-medium text-zinc-900 break-all">{value || "—"}</p>
      </div>
    </div>
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

  // On-chain whitelisting
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const whitelistAction = useContractAction();

  const reload = async () => {
    try {
      const data = await getInvestor(id);
      setUser(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestor(id);
        setUser(data);
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
    setActionMessage({
      type: "success",
      text: `KYC approved. On-chain: ${result.onchain_registration ?? "n/a"}`,
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

  const handleWhitelistOnChain = async (walletAddr: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!whitelistRegistryAddress) {
      setActionMessage({ type: "error", text: "Identity registry address not configured." });
      return;
    }
    const countryCode = parseInt(whitelistCountryCode, 10) || 840;
    await whitelistAction.execute({
      address: whitelistRegistryAddress as `0x${string}`,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "addToWhitelist",
      args: [walletAddr as `0x${string}`, countryCode],
    });
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

  const isIndividual = user.investor_type === "individual" || !user.investor_type;
  const isApproved = user.kyc_status === "approved";
  const hasWallets = user.wallets.length > 0;

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
          <div className="bg-zinc-50 rounded-lg p-3">
            <p className="text-zinc-400 text-xs">On-chain ID</p>
            {user.onchain_id ? <CopyableAddress address={user.onchain_id} truncate className="text-xs font-bold" /> : <p className="text-xs font-bold">—</p>}
          </div>
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
              <Badge variant={user.onboarding_completed ? "success" : "default"} size="sm">
                {user.onboarding_completed ? "Complete" : "Incomplete"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">On-chain ID</span>
              <span className="font-mono text-xs">{user.onchain_id ? `${user.onchain_id.slice(0, 8)}...` : "—"}</span>
            </div>
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
                        onClick={() => handleWhitelistOnChain(w.address)}
                        disabled={whitelistAction.isPending || whitelistAction.isConfirming || !whitelistRegistryAddress}
                        title="Whitelist on-chain"
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
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-zinc-400" /> On-Chain Whitelisting
          </h3>
          <p className="text-xs text-zinc-500 mb-3">
            Whitelist this buyer&apos;s wallet(s) on the platform&apos;s SimpleIdentityRegistry. Click the shield icon next to a wallet to whitelist it.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-4">
            <div className="flex-1 w-full">
              <label className="block text-xs text-zinc-500 mb-1">Identity Registry</label>
              <div className="w-full px-3 py-2 rounded-lg border border-zinc-100 bg-zinc-50 text-sm font-mono text-zinc-600">
                {whitelistRegistryAddress}
              </div>
            </div>
            <div className="w-32">
              <label className="block text-xs text-zinc-500 mb-1">Country Code</label>
              <input
                type="number"
                value={whitelistCountryCode}
                onChange={(e) => setWhitelistCountryCode(e.target.value)}
                placeholder="840"
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </div>
          </div>
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

      {/* Personal / Corporate Details */}
      <div className="bg-white rounded-lg border border-zinc-100 p-6">
        <h3 className="text-sm font-semibold text-zinc-900 mb-4">
          {isIndividual ? "Personal Details" : "Company Details"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          {isIndividual ? (
            <>
              <InfoRow label="Date of Birth" value={user.date_of_birth} icon={Calendar} />
              <InfoRow label="Nationality" value={user.nationality} icon={Flag} />
              <InfoRow label="Country of Residence" value={user.country_of_residence} icon={Globe} />
            </>
          ) : (
            <>
              <InfoRow label="Company Name" value={user.company_name} icon={Building2} />
              <InfoRow label="Registration Number" value={user.company_registration_number} icon={Copy} />
              <InfoRow label="Jurisdiction" value={user.company_jurisdiction} icon={Globe} />
            </>
          )}
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
