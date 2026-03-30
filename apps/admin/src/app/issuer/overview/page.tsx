"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Coins, Users, TrendingUp, Wallet, Plus, ArrowUpRight, BarChart3, Clock,
  CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { Button, Badge, ProgressBar, Spinner } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSales, type Sale } from "@/lib/api/repositories/sales";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/api/repositories/issuer-onboarding";

function StatusIcon({ status }: { status: string }) {
  if (status === "approved" || status === "active") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "pending" || status === "pending_approval") return <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  return <div className="h-5 w-5 rounded-full border-2 border-zinc-300" />;
}

function OnboardingChecklist({ onboarding }: { onboarding: OnboardingStatus }) {
  return (
    <IssuerDashboardLayout title="Complete Your Onboarding" description="Finish these steps to start issuing tokens">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Wallet */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 border border-zinc-200">
          <div className="flex items-start gap-4">
            <StatusIcon status={onboarding.wallet_status} />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Connect Wallet</h3>
              <p className="text-sm text-zinc-500 mt-1">
                {onboarding.wallet_status === "none" && "Link your Ethereum wallet to the platform"}
                {onboarding.wallet_status === "pending_approval" && "Your wallet is submitted and awaiting admin approval"}
                {onboarding.wallet_status === "approved" && "Wallet approved"}
                {onboarding.wallet_status === "rejected" && "Wallet rejected — contact support to resubmit"}
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

        {/* Identity Verification */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 border border-zinc-200">
          <div className="flex items-start gap-4">
            <StatusIcon status={onboarding.identity_status} />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                Verify Identity ({onboarding.issuer_type === "corporate" ? "KYB" : "KYC"})
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                {onboarding.identity_status === "none" && `Complete ${onboarding.issuer_type === "corporate" ? "corporate KYB" : "individual KYC"} verification via Sumsub`}
                {onboarding.identity_status === "pending" && "Verification under review"}
                {onboarding.identity_status === "approved" && "Identity verified"}
                {onboarding.identity_status === "rejected" && "Verification rejected — contact support"}
              </p>
            </div>
            {onboarding.identity_status === "none" && (
              <Link href="/issuer/onboarding/identity">
                <Button variant="primary" size="sm">Start</Button>
              </Link>
            )}
            {onboarding.identity_status === "approved" && (
              <Badge variant="active" size="sm">Done</Badge>
            )}
          </div>
        </motion.div>

        {/* Admin Activation */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 border border-zinc-200">
          <div className="flex items-start gap-4">
            <StatusIcon status={onboarding.issuer_status} />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Admin Activation</h3>
              <p className="text-sm text-zinc-500 mt-1">
                {onboarding.issuer_status === "pending" &&
                  (onboarding.wallet_status === "approved" && onboarding.identity_status === "approved"
                    ? "All gates met — awaiting admin activation"
                    : "Complete wallet and identity steps first"
                  )
                }
                {onboarding.issuer_status === "active" && "Your account is fully activated"}
                {onboarding.issuer_status === "suspended" && "Account suspended — contact support"}
              </p>
            </div>
            {onboarding.issuer_status === "active" && (
              <Badge variant="active" size="sm">Active</Badge>
            )}
          </div>
        </motion.div>

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
            { href: "/issuer/tokens/new", icon: <Plus className="h-6 w-6 text-darkAqua" />, bg: "bg-darkAqua/10", label: "Create Token", sub: "Deploy new ERC-3643" },
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
