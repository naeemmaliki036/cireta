"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Coins, Users, TrendingUp, Wallet, Plus, ArrowUpRight, BarChart3, Clock,
  CheckCircle2, AlertCircle, Loader2, Info,
} from "lucide-react";
import { Button, Badge, ProgressBar, Spinner } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { formatCurrency, cn } from "@/lib/utils";
import { getSales, type Sale } from "@/lib/api/repositories/sales";
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
          getSales(1, 20),
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

  return (
    <IssuerDashboardLayout title="Dashboard Overview" description="Monitor your tokens and sales performance">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Raised" value={totalRaised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Active Sales" value={activeSales.length} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total Investors" value={0} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Fees Earned" value={0} prefix="$" icon={<Wallet className="h-5 w-5" />} />
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-8 border border-darkBlack/10 mb-8">
        <h2 className="text-lg font-semibold text-text mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { href: "/issuer/tokens/new", icon: <Plus className="h-6 w-6 text-darkAqua" />, bg: "bg-darkAqua/10", label: "Create Token", sub: "Deploy new project token" },
            { href: "/issuer/sales/new", icon: <TrendingUp className="h-6 w-6 text-gold" />, bg: "bg-gold/10", label: "Start Sale", sub: "Launch token sale" },
            { href: "/issuer/compliance", icon: <Coins className="h-6 w-6 text-purple-600" />, bg: "bg-purple-100", label: "Compliance", sub: "Freeze, recover tokens" },
          ].map((a) => (
            <Link key={a.href} href={a.href}
              className="flex items-center gap-5 px-6 py-5 rounded-2xl border border-gray-200 hover:border-darkAqua hover:bg-darkAqua/5 bg-white shadow-sm transition-colors group">
              <div className={`w-12 h-12 rounded-xl ${a.bg} flex items-center justify-center`}>{a.icon}</div>
              <div>
                <p className="font-semibold text-text">{a.label}</p>
                <p className="text-sm text-darkBlack/50">{a.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Active Sales */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-lg font-semibold text-text">Active Sales</h2>
          <Link href="/issuer/sales">
            <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight className="h-4 w-4" />}>View All</Button>
          </Link>
        </div>
        {activeSales.length === 0 ? (
          <p className="text-center text-darkBlack/40 py-8">No active sales yet</p>
        ) : (
          <div className="space-y-3">
            {activeSales.map((sale) => {
              const raised = parseFloat(sale.total_raised || "0");
              const target = parseFloat(sale.hard_cap || "0");
              const pct = target > 0 ? (raised / target) * 100 : 0;
              return (
                <Link key={sale.id} href={`/issuer/sales/${sale.id}`}
                  className="block px-6 py-5 rounded-2xl bg-box hover:bg-darkAqua/5 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-text">{sale.token_name ?? sale.id}</h3>
                      <p className="text-sm text-darkBlack/50">{sale.token_symbol}</p>
                    </div>
                    <Badge variant="active" size="sm" className="capitalize">Active</Badge>
                  </div>
                  <ProgressBar value={pct} size="sm" />
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-darkBlack/50">{formatCurrency(raised)} / {formatCurrency(target)}</span>
                    <span className="text-darkBlack/50 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{sale.phases[0]?.end_time?.slice(0, 10) ?? "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
