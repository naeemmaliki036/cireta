"use client";

import { useState } from "react";
import { Wallet, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { submitWallet } from "@/lib/api/repositories/issuer-onboarding";

export default function WalletOnboardingPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      setError("Invalid Ethereum address");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitWallet(walletAddress);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit wallet");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IssuerDashboardLayout
      title="Connect Wallet"
      description="Submit your Ethereum wallet address"
      breadcrumbs={[{ label: "Dashboard", href: "/issuer/overview" }, { label: "Connect Wallet" }]}
    >
      <div className="max-w-lg mx-auto">
        {success ? (
          <div className="bg-white rounded-2xl p-8 border border-zinc-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Wallet Submitted</h2>
            <p className="text-zinc-500 text-sm">
              Your wallet address has been submitted for admin approval. You&apos;ll be notified once it&apos;s reviewed.
            </p>
            <p className="text-sm font-mono bg-zinc-50 p-3 rounded-lg break-all">{walletAddress}</p>
            <Link href="/issuer/overview">
              <Button variant="primary" className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-zinc-200 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ethereum Wallet</h2>
                <p className="text-sm text-zinc-500">Enter your wallet address for token deployments</p>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-600 mb-1">Wallet Address</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-teal-500"
                  required
                />
                <p className="text-xs text-zinc-400 mt-1">This address will be used as the issuer wallet for on-chain operations</p>
              </div>
              <div className="flex gap-3">
                <Link href="/issuer/overview">
                  <Button variant="outline" type="button">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                </Link>
                <Button type="submit" variant="primary" isLoading={submitting} className="flex-1">
                  Submit for Approval
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
