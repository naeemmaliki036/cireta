"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, AlertCircle, Lock, Globe, FileCheck } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { InfoSidebar, type InfoSidebarItem } from "@/components/molecules";
import { me, type User } from "@/lib/api/repositories/auth.repository";
import { apiGet } from "@/lib/api/client";
import { formatCountry } from "@/lib/countries";

const VERIFICATION_TIPS: InfoSidebarItem[] = [
  {
    icon: Lock,
    title: "Why we verify",
    body:
      "Cireta sales are regulated security tokens — only KYC-verified wallets are allowed to hold or transfer them. Verifying once unlocks every sale on the platform.",
  },
  {
    icon: Globe,
    title: "Powered by Sumsub",
    body:
      "Documents are encrypted and processed by Sumsub, a globally certified identity verification provider. Cireta does not store raw copies of your ID.",
  },
  {
    icon: FileCheck,
    title: "Re-verification",
    body:
      "If your verification expires or your details change materially (legal name, country of residence), you'll need to re-verify before placing your next purchase.",
  },
];

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
        <p className="text-sm text-text mb-4">{error}</p>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!user || !kyc) return null;

  const isExpired = kyc.expiry_date && new Date(kyc.expiry_date) < new Date();
  const needsReverify = kyc.status === "expired" || kyc.status === "rejected" || isExpired;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text tracking-tight">Verification</h1>
        <p className="text-sm text-black/60 mt-1.5">Your identity verification status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="min-w-0 space-y-4">
          {/* Status overview */}
          <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
            <div className="p-5 flex items-center gap-4 border-b border-black/5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                kyc.status === "approved"
                  ? "bg-darkAqua text-white"
                  : kyc.status === "pending"
                  ? "bg-darkAqua/10 text-darkAqua"
                  : "bg-box text-black/40"
              }`}>
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-text font-semibold text-base">
                    {kyc.status === "approved" ? "Verified" : kyc.status === "pending" ? "Verification pending" : "Not verified"}
                  </h3>
                  <Badge variant={STATUS_VARIANTS[kyc.status] ?? "outline"} size="sm">
                    {kyc.status}
                  </Badge>
                </div>
                <p className="text-black/60 text-sm mt-0.5">
                  {kyc.status === "approved"
                    ? "Identity verified"
                    : kyc.status === "pending"
                    ? "Under review"
                    : "Complete verification to buy"}
                </p>
              </div>
            </div>

            <dl className="divide-y divide-black/5">
              <div className="flex justify-between px-5 py-3">
                <dt className="text-black/60 text-sm">Buyer type</dt>
                <dd className="text-text text-sm font-medium capitalize">{kyc.investor_type || "—"}</dd>
              </div>
              <div className="flex justify-between px-5 py-3">
                <dt className="text-black/60 text-sm">Country</dt>
                <dd className="text-text text-sm font-medium">{kyc.country_code ? formatCountry(kyc.country_code) : "—"}</dd>
              </div>
              <div className="flex justify-between px-5 py-3">
                <dt className="text-black/60 text-sm">Expiry date</dt>
                <dd className={`text-sm font-medium ${isExpired ? "text-text font-semibold" : "text-text"}`}>
                  {kyc.expiry_date ? new Date(kyc.expiry_date).toLocaleDateString() : "No expiry"}
                </dd>
              </div>
            </dl>
          </div>

          {isExpired && (
            <div className="p-4 rounded-2xl bg-box border border-black/10 flex gap-3">
              <AlertCircle className="w-5 h-5 text-text shrink-0" />
              <div>
                <p className="text-text text-sm font-semibold">Verification expired</p>
                <p className="text-black/60 text-xs mt-0.5">Your verification has expired. Please re-verify to continue buying.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          {needsReverify ? (
            <Link href="/verify">
              <Button variant="primary" size="sm">Re-verify identity</Button>
            </Link>
          ) : kyc.status === "none" ? (
            <Link href="/verify">
              <Button variant="primary" size="sm">Start verification</Button>
            </Link>
          ) : kyc.status === "pending" ? (
            <p className="text-sm text-black/60">
              Your verification is being reviewed. This usually takes a few minutes but can take up to 24 hours.
              In case of delay, contact{" "}
              <a href="https://cireta.com" target="_blank" rel="noopener noreferrer" className="text-darkAqua underline hover:text-darkAqua/80">compliance@cireta.com</a>.
            </p>
          ) : null}
        </div>

        <InfoSidebar items={VERIFICATION_TIPS} />
      </div>
    </div>
  );
}
