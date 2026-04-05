"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Coins, TrendingUp, Wallet, Plus, ArrowUpRight, BarChart3,
  CheckCircle2, AlertCircle, Loader2, Info,
} from "lucide-react";
import { Button, Badge, ProgressBar, Spinner } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { formatCurrency, cn } from "@/lib/utils";
import { getIssuerSales, type Sale } from "@/lib/api/repositories/sales";
import { getOnboardingStatus, submitWalletForApproval, discardWallet, type OnboardingStatus } from "@/lib/api/repositories/issuer-onboarding";

function StatusIcon({ status }: { status: string }) {
  if (status === "approved" || status === "active") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "pending" || status === "pending_approval") return <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-zinc-300" />;
}

function OnboardingChecklist({ onboarding: initialOnboarding }: { onboarding: OnboardingStatus }) {
  const [onboarding, setOnboarding] = useState(initialOnboarding);
  const [walletLoading, setWalletLoading] = useState(false);
  const kycExempted = !onboarding.kyc_required;
  const identityDone = onboarding.identity_status === "approved";

  const handleSubmitWallet = async () => {
    setWalletLoading(true);
    try {
      await submitWalletForApproval();
      setOnboarding((prev) => ({ ...prev, wallet_status: "pending_approval" }));
    } catch { /* error handled by API client */ }
    finally { setWalletLoading(false); }
  };

  const handleDiscardWallet = async () => {
    setWalletLoading(true);
    try {
      await discardWallet();
      setOnboarding((prev) => ({ ...prev, wallet_status: "none", wallet_address: null, wallet_connected: false }));
    } catch { /* error handled by API client */ }
    finally { setWalletLoading(false); }
  };

  const identityReady = identityDone || kycExempted;

  // Wallet verified + identity done or exempted + not yet submitted
  const readyToSubmit =
    onboarding.wallet_status === "verified" && identityReady && onboarding.issuer_status === "pending";

  // Submitted and waiting for admin to activate
  const awaitingApproval =
    onboarding.wallet_status === "pending_approval" && identityReady && onboarding.issuer_status === "pending";

  const completedCount = [
    onboarding.wallet_status === "approved",
    identityDone,
    onboarding.issuer_status === "active",
  ].filter(Boolean).length;

  const allGatesMetAwaitingAdmin = awaitingApproval ||
    (onboarding.wallet_status === "approved" && identityReady && onboarding.issuer_status !== "active");

  const bannerType = readyToSubmit ? "ready" : allGatesMetAwaitingAdmin ? "awaiting" : "onboarding";

  return (
    <IssuerDashboardLayout title="Complete Your Onboarding" description="Finish these steps to start issuing tokens">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Notification banner */}
        <div className={cn(
          "flex items-start gap-3 p-4 rounded-xl border",
          bannerType === "ready" ? "bg-teal-50 border-teal-200"
            : bannerType === "awaiting" ? "bg-blue-50 border-blue-200"
            : "bg-amber-50 border-amber-200"
        )}>
          <Info className={cn(
            "h-5 w-5 mt-0.5 shrink-0",
            bannerType === "ready" ? "text-teal-500"
              : bannerType === "awaiting" ? "text-blue-500"
              : "text-amber-500"
          )} />
          <div>
            <p className={cn(
              "text-sm font-medium",
              bannerType === "ready" ? "text-teal-800"
                : bannerType === "awaiting" ? "text-blue-800"
                : "text-amber-800"
            )}>
              {bannerType === "ready" && "Ready to submit"}
              {bannerType === "awaiting" && "Awaiting admin approval"}
              {bannerType === "onboarding" && "Onboarding required"}
            </p>
            <p className={cn(
              "text-xs mt-0.5",
              bannerType === "ready" ? "text-teal-600"
                : bannerType === "awaiting" ? "text-blue-600"
                : "text-amber-600"
            )}>
              {bannerType === "ready" && "All steps are complete. Submit your profile below for admin review and activation."}
              {bannerType === "awaiting" && "Your profile has been submitted. A platform administrator will review and activate your account."}
              {bannerType === "onboarding" && "Complete the steps below before you can access platform features. Navigation is locked until your account is fully activated."}
            </p>
          </div>
        </div>

        {/* Step counter */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="font-medium text-zinc-600">
            {completedCount}/3 steps completed
          </span>
        </div>

        {/* Step 1: Wallet */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 border border-zinc-200">
          <div className="flex items-start gap-4">
            {(onboarding.wallet_status === "verified" || onboarding.wallet_status === "pending_approval")
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <StatusIcon status={onboarding.wallet_status} />
            }
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Connect Wallet</h3>
              <p className="text-sm text-zinc-500 mt-1">
                {onboarding.wallet_status === "none" && "Connect your Ethereum wallet and sign a message to prove ownership."}
                {onboarding.wallet_status === "verified" && "Wallet connected and ownership verified."}
                {onboarding.wallet_status === "pending_approval" && "Wallet submitted and awaiting admin approval."}
                {onboarding.wallet_status === "approved" && "Wallet verified and approved."}
                {onboarding.wallet_status === "rejected" && "Wallet rejected — please contact support to resubmit."}
              </p>
              {/* Show linked wallet address */}
              {onboarding.wallet_address && onboarding.wallet_status !== "none" && (
                <div className="mt-2 flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100">
                  <Wallet className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <CopyableAddress address={onboarding.wallet_address!} truncate className="text-xs text-zinc-600" />
                  {onboarding.wallet_status === "verified" && (
                    <button
                      onClick={handleDiscardWallet}
                      disabled={walletLoading}
                      className="text-[11px] text-red-400 hover:text-red-600 underline shrink-0 ml-auto disabled:opacity-50"
                    >
                      Discard
                    </button>
                  )}
                  {onboarding.wallet_status === "pending_approval" && (
                    <Badge variant="pending" size="sm" className="shrink-0 ml-auto">Pending Approval</Badge>
                  )}
                  {onboarding.wallet_status === "approved" && (
                    <Badge variant="active" size="sm" className="shrink-0 ml-auto">Approved</Badge>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-400 mt-2">
                Your wallet is required to deploy project tokens, create token sales, and manage on-chain compliance.
                Ownership verification ensures only you can operate as this issuer on the blockchain.
              </p>
            </div>
            {onboarding.wallet_status === "none" && (
              <Link href="/issuer/onboarding/wallet">
                <Button variant="primary" size="sm">Connect</Button>
              </Link>
            )}
            {onboarding.wallet_status === "approved" && (
              <Badge variant="active" size="sm">Done</Badge>
            )}
          </div>
        </motion.div>

        {/* Step 2: Identity Verification */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 border border-zinc-200">
          <div className="flex items-start gap-4">
            {kycExempted ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <StatusIcon status={onboarding.identity_status} />
            )}
            <div className="flex-1">
              {kycExempted ? (
                <>
                  <h3 className="font-semibold text-lg">Identity Verification (Exempted)</h3>
                  <p className="text-sm text-green-600 mt-1">
                    KYC/KYB verification is not required for your account. A platform administrator has pre-approved your identity.
                  </p>
                  <p className="text-xs text-zinc-400 mt-2">
                    This exemption was granted during your whitelist approval. If your issuer status changes, you may be asked to complete verification in the future.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-lg">
                    Verify Identity ({onboarding.issuer_type === "corporate" ? "KYB" : "KYC"})
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    {onboarding.identity_status === "none" && `Complete ${onboarding.issuer_type === "corporate" ? "corporate KYB (Know Your Business)" : "individual KYC (Know Your Customer)"} verification via our identity partner Sumsub.`}
                    {onboarding.identity_status === "pending" && "Your verification is under review. This typically takes a few minutes."}
                    {onboarding.identity_status === "approved" && "Identity successfully verified."}
                    {onboarding.identity_status === "rejected" && "Verification was rejected — please contact support for assistance."}
                  </p>
                  <p className="text-xs text-zinc-400 mt-2">
                    {onboarding.issuer_type === "corporate"
                      ? "As a corporate issuer, you must provide company registration documents, director identification, and UBO (Ultimate Beneficial Owner) details. This is required by securities regulations to ensure compliance."
                      : "As an individual issuer, you must provide a valid government-issued ID and a selfie. This is required by securities regulations to ensure all token issuers are properly identified."
                    }
                  </p>
                </>
              )}
            </div>
            {!kycExempted && onboarding.identity_status === "none" && (
              <Link href="/issuer/onboarding/identity">
                <Button variant="primary" size="sm">Start</Button>
              </Link>
            )}
            {(identityDone || kycExempted) && (
              <Badge variant="active" size="sm">{kycExempted ? "Exempted" : "Done"}</Badge>
            )}
          </div>
        </motion.div>

        {/* Submit for Approval CTA — only when wallet verified + identity done, before submission */}
        {readyToSubmit && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Ready to submit</h3>
                <p className="text-sm text-teal-100 mt-1">
                  Your wallet is verified and identity requirements are met. Submit your profile for platform admin review and activation.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white text-white hover:bg-white/10 shrink-0"
                isLoading={walletLoading}
                onClick={handleSubmitWallet}
              >
                Submit for Approval
              </Button>
            </div>
          </motion.div>
        )}

        {/* Awaiting Approval — after submission, before admin activates */}
        {awaitingApproval && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
            <div className="flex items-start gap-4">
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin mt-0.5" />
              <div>
                <h3 className="font-semibold text-lg text-blue-900">Awaiting Admin Approval</h3>
                <p className="text-sm text-blue-600 mt-1">
                  Your wallet and identity have been submitted. A platform administrator will review your profile and activate your account.
                  You&apos;ll be notified once approved.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Admin Activation — only show when already approved or active */}
        {(onboarding.issuer_status === "active") && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-6 border border-zinc-200">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Admin Activation</h3>
                <p className="text-sm text-zinc-500 mt-1">Your issuer account is fully activated.</p>
              </div>
              <Badge variant="active" size="sm">Active</Badge>
            </div>
          </motion.div>
        )}

        {/* Help */}
        <div className="text-center pt-4">
          <p className="text-sm text-zinc-400">
            Need help? Contact <span className="font-medium text-zinc-500">admin@cireta.io</span>
          </p>
        </div>
      </div>
    </IssuerDashboardLayout>
  );
}

export default function IssuerOverviewPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [salesData, onboardingData] = await Promise.allSettled([
          getIssuerSales(1, 100),
          getOnboardingStatus(),
        ]);
        if (salesData.status === "fulfilled") setSales(salesData.value.items);
        if (onboardingData.status === "fulfilled") setOnboarding(onboardingData.value);
      } catch (err) { console.error("Failed to load data:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <IssuerDashboardLayout title="Dashboard">
        <div className="flex justify-center py-16"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  // Show onboarding checklist if issuer is not fully activated
  if (onboarding && !onboarding.can_deploy) {
    return <OnboardingChecklist onboarding={onboarding} />;
  }

  const totalRaised = sales.reduce((s, x) => s + parseFloat(x.total_raised || "0"), 0);
  const activeSales = sales.filter((s) => s.status === "active");
  const draftSales = sales.filter((s) => s.status === "draft");
  const pendingSales = sales.filter((s) => s.status === "pending_approval");
  const comingSoonSales = sales.filter((s) => s.status === "approved_coming_soon");
  const completedSales = sales.filter((s) => s.status === "finalized_success" || s.status === "finalized_failed");
  const deployedSales = sales.filter((s) => !!s.contract_address);

  const statusBreakdown = [
    { label: "Active", count: activeSales.length, color: "bg-green-500" },
    { label: "Coming Soon", count: comingSoonSales.length, color: "bg-amber-400" },
    { label: "Pending Approval", count: pendingSales.length, color: "bg-blue-400" },
    { label: "Draft", count: draftSales.length, color: "bg-zinc-300" },
    { label: "Completed", count: completedSales.length, color: "bg-purple-400" },
  ];

  return (
    <IssuerDashboardLayout title="Dashboard Overview" description="Monitor your tokens and sales performance">
      {/* Top Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Raised", value: formatCurrency(totalRaised), icon: <BarChart3 className="h-5 w-5" />, color: "text-darkAqua", bg: "bg-darkAqua/10" },
          { label: "Total Sales", value: sales.length.toString(), icon: <TrendingUp className="h-5 w-5" />, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Deployed", value: deployedSales.length.toString(), icon: <Coins className="h-5 w-5" />, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Active Now", value: activeSales.length.toString(), icon: <CheckCircle2 className="h-5 w-5" />, color: "text-green-600", bg: "bg-green-50" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl p-5 border border-zinc-100 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <p className="text-xs font-medium text-darkBlack/50 uppercase tracking-wide">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-text tracking-tight">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Sale Status Breakdown + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status Breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 border border-darkBlack/10">
          <h2 className="text-sm font-semibold text-darkBlack/60 uppercase tracking-wide mb-4">Sale Pipeline</h2>
          {sales.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-darkBlack/30 text-sm mb-3">No sales created yet</p>
              <Link href="/issuer/sales/new">
                <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>Create First Sale</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {statusBreakdown.map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    <span className="text-sm text-text">{s.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-text">{s.count}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-sm font-medium text-darkBlack/60">Total</span>
                <span className="text-sm font-bold text-text">{sales.length}</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-6 border border-darkBlack/10">
          <h2 className="text-sm font-semibold text-darkBlack/60 uppercase tracking-wide mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {[
              { href: "/issuer/tokens/new", icon: <Plus className="h-5 w-5 text-darkAqua" />, bg: "bg-darkAqua/10", label: "Create Token", sub: "Deploy a new ERC-3643 security token" },
              { href: "/issuer/sales/new", icon: <TrendingUp className="h-5 w-5 text-gold" />, bg: "bg-gold/10", label: "Create Sale", sub: "Set up a token sale with phases and pricing" },
              { href: "/issuer/compliance", icon: <Coins className="h-5 w-5 text-purple-600" />, bg: "bg-purple-50", label: "Compliance", sub: "Freeze, forced transfer, recover tokens" },
              { href: "/issuer/tokens", icon: <Wallet className="h-5 w-5 text-blue-600" />, bg: "bg-blue-50", label: "Manage Tokens", sub: "View tokens, mint, manage compliance" },
            ].map((a) => (
              <Link key={a.href} href={a.href}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-zinc-100 hover:border-darkAqua/30 hover:bg-darkAqua/5 transition-all group">
                <div className={`w-10 h-10 rounded-lg ${a.bg} flex items-center justify-center shrink-0`}>{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-text">{a.label}</p>
                  <p className="text-xs text-darkBlack/40 truncate">{a.sub}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-darkBlack/20 group-hover:text-darkAqua transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Sales */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="bg-white rounded-2xl p-6 border border-darkBlack/10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-darkBlack/60 uppercase tracking-wide">Recent Sales</h2>
          <Link href="/issuer/sales">
            <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight className="h-4 w-4" />}>View All</Button>
          </Link>
        </div>
        {sales.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="h-7 w-7 text-zinc-300" />
            </div>
            <p className="text-darkBlack/40 text-sm mb-1">No sales yet</p>
            <p className="text-darkBlack/25 text-xs mb-4">Create a token first, then set up your first sale</p>
            <Link href="/issuer/sales/new">
              <Button variant="primary" size="sm">Create Sale</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sales.slice(0, 5).map((sale) => {
              const raised = parseFloat(sale.total_raised || "0");
              const target = parseFloat(sale.hard_cap || "0");
              const pct = target > 0 ? Math.min(Math.round((raised / target) * 100), 100) : 0;
              const statusVariant = sale.status === "active" ? "active"
                : sale.status === "draft" ? "pending"
                : sale.status === "approved_coming_soon" ? "active"
                : sale.status === "pending_approval" ? "pending"
                : "pending";
              const statusLabel = sale.status === "approved_coming_soon" ? "Coming Soon"
                : sale.status === "pending_approval" ? "Pending"
                : sale.status === "finalized_success" ? "Completed"
                : sale.status === "finalized_failed" ? "Failed"
                : sale.status.charAt(0).toUpperCase() + sale.status.slice(1);
              return (
                <Link key={sale.id} href={`/issuer/sales/${sale.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-box transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text truncate">{sale.title || sale.token_name || "Untitled Sale"}</p>
                    <p className="text-xs text-darkBlack/40">
                      {sale.token_symbol ? `${sale.token_symbol} · ` : ""}{sale.is_coming_soon ? "Coming Soon" : target > 0 ? `${formatCurrency(raised)} / ${formatCurrency(target)}` : "No cap set"}
                    </p>
                  </div>
                  {!sale.is_coming_soon && target > 0 && (
                    <div className="w-20 shrink-0">
                      <ProgressBar value={pct} size="sm" />
                      <p className="text-[10px] text-darkBlack/30 mt-0.5 text-right">{pct}%</p>
                    </div>
                  )}
                  <Badge variant={statusVariant as "active" | "pending"} size="sm" className="shrink-0">{statusLabel}</Badge>
                  <ArrowUpRight className="h-4 w-4 text-darkBlack/15 group-hover:text-darkAqua transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
