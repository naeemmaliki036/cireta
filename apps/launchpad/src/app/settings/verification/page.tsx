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
        try {
          const details = await apiGet<KYCDetails>("/api/v1/kyc/status");
          setKyc(details);
        } catch {
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
        <p className="text-red-600 text-sm mb-4">{error}</p>
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
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Verification</h2>
        <p className="text-gray-500 text-sm">Your KYC/AML verification status.</p>
      </div>

      {/* Status Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            kyc.status === "approved" ? "bg-emerald-50" : kyc.status === "pending" ? "bg-amber-50" : "bg-gray-100"
          }`}>
            <Shield className={`w-7 h-7 ${
              kyc.status === "approved" ? "text-emerald-600" : kyc.status === "pending" ? "text-amber-600" : "text-gray-400"
            }`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-gray-900 font-semibold text-lg">
                {kyc.status === "approved" ? "Verified" : kyc.status === "pending" ? "Verification Pending" : "Not Verified"}
              </h3>
              <Badge variant={STATUS_VARIANTS[kyc.status] ?? "outline"} size="sm">
                {kyc.status}
              </Badge>
            </div>
            <p className="text-gray-400 text-sm mt-0.5">{kyc.status === "approved" ? "Identity verified via Sumsub" : kyc.status === "pending" ? "Under review" : "Complete verification to buy"}</p>
          </div>
        </div>

        <div className="space-y-0">
          <div className="flex justify-between py-3 border-b border-gray-100">
            <span className="text-gray-500 text-sm">Buyer Type</span>
            <span className="text-gray-900 text-sm font-medium capitalize">{kyc.investor_type || "\u2014"}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-gray-100">
            <span className="text-gray-500 text-sm">Country</span>
            <span className="text-gray-900 text-sm font-medium">{kyc.country_code || "\u2014"}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-gray-500 text-sm">Expiry Date</span>
            <span className={`text-sm font-medium ${isExpired ? "text-red-600" : "text-gray-900"}`}>
              {kyc.expiry_date ? new Date(kyc.expiry_date).toLocaleDateString() : "No expiry"}
            </span>
          </div>
        </div>
      </div>

      {/* Expiry Warning */}
      {isExpired && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <p className="text-red-700 text-sm font-medium">Verification Expired</p>
            <p className="text-red-600/70 text-xs mt-0.5">Your KYC verification has expired. Please re-verify to continue investing.</p>
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
        <div className="text-gray-600 text-sm">
          <p>Your verification is being reviewed. This usually takes a few minutes but can take up to 24 hours.</p>
          <p className="mt-1">In case of delay, contact <a href="https://cireta.com" target="_blank" rel="noopener noreferrer" className="text-darkAqua underline hover:text-darkAqua/80">compliance@cireta.com</a>.</p>
        </div>
      ) : null}
    </div>
  );
}
