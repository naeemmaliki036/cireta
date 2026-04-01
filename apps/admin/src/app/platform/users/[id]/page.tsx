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
} from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { getInvestor, type InvestorDetail } from "@/lib/api/repositories/investors";

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    approved: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    pending: { color: "bg-amber-100 text-amber-700", icon: Clock },
    rejected: { color: "bg-red-100 text-red-700", icon: XCircle },
    none: { color: "bg-zinc-100 text-zinc-500", icon: XCircle },
    expired: { color: "bg-red-100 text-red-700", icon: XCircle },
  };
  const c = config[status] ?? config.none;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${c.color}`}>
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

  if (loading) {
    return (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      </PlatformAdminLayout>
    );
  }

  if (error || !user) {
    return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-600">{error ?? "User not found"}</p>
          <Link href="/platform/users">
            <Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Users</Button>
          </Link>
        </div>
      </PlatformAdminLayout>
    );
  }

  const isIndividual = user.investor_type === "individual" || !user.investor_type;

  return (
    <PlatformAdminLayout
      title={user.display_name || user.email}
      description={user.email}
    >
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-darkAqua/10 flex items-center justify-center">
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

      {/* Status grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* KYC Status */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-400" /> KYC Verification
            </h3>
            <StatusPill status={user.kyc_status} />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Level</span>
              <span className="font-medium">{user.kyc_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Provider</span>
              <span className="font-medium">{user.kyc_provider ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Verified at</span>
              <span className="font-medium">{user.kyc_verified_at ? user.kyc_verified_at.slice(0, 10) : "—"}</span>
            </div>
          </div>
        </div>

        {/* Email & Onboarding */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6">
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
        <div className="bg-white rounded-2xl border border-zinc-100 p-6">
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4">
            <Wallet className="h-4 w-4 text-zinc-400" /> Wallets ({user.wallet_count})
          </h3>
          {user.wallets.length === 0 ? (
            <p className="text-sm text-zinc-400">No wallets connected</p>
          ) : (
            <div className="space-y-2">
              {user.wallets.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs text-zinc-700">
                    {w.address.slice(0, 6)}...{w.address.slice(-4)}
                  </span>
                  {w.is_primary && <Badge variant="success" size="sm">Primary</Badge>}
                </div>
              ))}
              {user.wallets.length > 5 && (
                <p className="text-xs text-zinc-400 text-center">+{user.wallets.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Personal / Corporate Details */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
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
