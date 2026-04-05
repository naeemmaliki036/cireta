"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, AlertCircle } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { me, type User } from "@/lib/api/repositories/auth.repository";
import { apiGet } from "@/lib/api/client";

interface KYCDetails {
  status: string;
  tier: number;
  expiry_date: string | null;
  country_code: string | null;
  investor_type: string | null;
}

const TIER_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Basic (Tier 1)",
  2: "Standard (Tier 2)",
  3: "Enhanced (Tier 3)",
};

const STATUS_VARIANTS: Record<string, "success" | "pending" | "error" | "outline"> = {
  approved: "success",
  pending: "pending",
  rejected: "error",
  expired: "error",
  none: "outline",
};

export default function VerificationSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [kyc, setKyc] = useState<KYCDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const u = await me();
        setUser(u);
        // Try to fetch detailed KYC info
        try {
          const details = await apiGet<KYCDetails>("/api/v1/kyc/status");
          setKyc(details);
        } catch {
          // Fallback to user data
          setKyc({
            status: u.kyc_status,
            tier: u.kyc_level,
            expiry_date: null,
            country_code: u.country_code,
            investor_type: u.investor_type,
          });
        }
      } catch {
        setError("Failed to load verification details.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!user || !kyc) return null;

  const isExpired = kyc.expiry_date && new Date(kyc.expiry_date) < new Date();
  const needsReverify = kyc.status === "expired" || kyc.status === "rejected" || isExpired;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Verification</h2>
        <p className="text-white/40 text-sm">Your KYC/AML verification status.</p>
      </div>

      {/* Status Overview */}
      <div className="bg-white/5 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
            kyc.status === "approved" ? "bg-green-500/20" : kyc.status === "pending" ? "bg-yellow-500/20" : "bg-white/10"
          }`}>
            <Shield className={`w-7 h-7 ${
              kyc.status === "approved" ? "text-green-400" : kyc.status === "pending" ? "text-yellow-400" : "text-white/40"
            }`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-lg">
                {kyc.status === "approved" ? "Verified" : kyc.status === "pending" ? "Verification Pending" : "Not Verified"}
              </h3>
              <Badge variant={STATUS_VARIANTS[kyc.status] ?? "outline"} size="sm">
                {kyc.status}
              </Badge>
            </div>
            <p className="text-white/40 text-sm mt-0.5">{TIER_LABELS[kyc.tier] ?? `Tier ${kyc.tier}`}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-white/5">
            <span className="text-white/50 text-sm">KYC Tier</span>
            <span className="text-white text-sm font-medium">Level {kyc.tier}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-white/5">
            <span className="text-white/50 text-sm">Investor Type</span>
            <span className="text-white text-sm font-medium capitalize">{kyc.investor_type || "—"}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-white/5">
            <span className="text-white/50 text-sm">Country</span>
            <span className="text-white text-sm font-medium">{kyc.country_code || "—"}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-white/50 text-sm">Expiry Date</span>
            <span className={`text-sm font-medium ${isExpired ? "text-red-400" : "text-white"}`}>
              {kyc.expiry_date ? new Date(kyc.expiry_date).toLocaleDateString() : "No expiry"}
            </span>
          </div>
        </div>
      </div>

      {/* Expiry Warning */}
      {isExpired && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 text-sm font-medium">Verification Expired</p>
            <p className="text-red-300/60 text-xs mt-0.5">Your KYC verification has expired. Please re-verify to continue investing.</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {needsReverify ? (
        <Link href="/verify">
          <Button variant="primary" size="sm" className="w-full sm:w-auto">
            Re-verify Identity
          </Button>
        </Link>
      ) : kyc.status === "none" ? (
        <Link href="/verify">
          <Button variant="primary" size="sm" className="w-full sm:w-auto">
            Start Verification
          </Button>
        </Link>
      ) : kyc.status === "pending" ? (
        <p className="text-yellow-400/60 text-sm">Your verification is being reviewed. This usually takes a few minutes.</p>
      ) : null}
    </div>
  );
}
