"use client";

import { useState, useCallback } from "react";
import { Wallet, CheckCircle2, ArrowLeft, ShieldCheck, AlertTriangle, RotateCcw } from "lucide-react";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import Link from "next/link";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { submitWallet } from "@/lib/api/repositories/issuer-onboarding";

type Step = "connect" | "verified" | "submitted";

export default function WalletOnboardingPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [step, setStep] = useState<Step>("connect");
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 → 2: Sign message to verify ownership
  const handleVerify = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");
    try {
      const n = crypto.randomUUID();
      const message = `I am linking this wallet to my Cireta issuer account.\n\nWallet: ${address}\nNonce: ${n}`;
      const sig = await signMessageAsync({ message });
      setVerifiedAddress(address);
      setSignature(sig);
      setNonce(n);
      setStep("verified");
    } catch (err) {
      if (err instanceof Error && err.message.includes("User rejected")) {
        setError("Signature rejected. Please sign the message to prove wallet ownership.");
      } else {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    } finally {
      setLoading(false);
    }
  }, [address, signMessageAsync]);

  // Step 2 → 3: Submit to backend for admin approval
  const handleSubmit = useCallback(async () => {
    if (!verifiedAddress || !signature || !nonce) return;
    setLoading(true);
    setError("");
    try {
      await submitWallet(verifiedAddress, signature, nonce);
      setStep("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit wallet");
    } finally {
      setLoading(false);
    }
  }, [verifiedAddress, signature, nonce]);

  // Discard verified wallet and start over
  const handleDiscard = () => {
    setVerifiedAddress(null);
    setSignature(null);
    setNonce(null);
    setError("");
    disconnect();
    setStep("connect");
  };

  return (
    <IssuerDashboardLayout
      title="Connect Wallet"
      description="Link and verify your Ethereum wallet"
    >
      <div className="max-w-lg mx-auto space-y-6">
        {/* ── Step 3: Submitted ── */}
        {step === "submitted" ? (
          <div className="bg-white rounded-2xl p-8 border border-zinc-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Wallet Saved</h2>
            <p className="text-zinc-500 text-sm">
              Your wallet has been verified and saved. Return to the dashboard to submit for admin approval once all onboarding steps are complete.
            </p>
            <div className="text-sm bg-zinc-50 p-3 rounded-lg">
              <CopyableAddress address={verifiedAddress!} className="text-sm text-zinc-700" />
            </div>
            <Link href="/issuer/overview">
              <Button variant="primary" className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Info card */}
            <div className="bg-teal-50/50 rounded-2xl p-5 border border-teal-100">
              <div className="flex gap-3">
                <ShieldCheck className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-sm text-teal-800">
                  <p className="font-medium mb-1">Why do I need to connect a wallet?</p>
                  <p>
                    As an issuer, your wallet is used to deploy project tokens and manage token sales on-chain.
                    You must prove ownership by signing a message — this ensures only you can link this wallet
                    to your issuer account. No funds are transferred during this step.
                  </p>
                  <p className="mt-2 font-medium text-teal-700">
                    Once submitted and approved by admin, this wallet cannot be changed by you. Only a platform
                    administrator can update your issuer wallet after approval.
                  </p>
                </div>
              </div>
            </div>

            {/* Main card */}
            <div className="bg-white rounded-2xl p-8 border border-zinc-200 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Wallet className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Ethereum Wallet</h2>
                  <p className="text-sm text-zinc-500">
                    {step === "connect" && "Connect your wallet and sign to verify ownership"}
                    {step === "verified" && "Wallet verified — review and save"}
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Step 1: Connect & Verify ── */}
              {step === "connect" && (
                <>
                  {!isConnected ? (
                    <div className="space-y-4">
                      <div className="bg-zinc-50 rounded-xl p-6 text-center space-y-3">
                        <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
                          <Wallet className="h-7 w-7 text-zinc-400" />
                        </div>
                        <p className="text-sm text-zinc-500">No wallet connected</p>
                        <p className="text-xs text-zinc-400">
                          Connect your MetaMask, Coinbase, WalletConnect, or other supported wallet.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Link href="/issuer/overview">
                          <Button variant="outline" type="button">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back
                          </Button>
                        </Link>
                        <Button variant="primary" className="flex-1" onClick={() => openConnectModal?.()}>
                          Connect Wallet
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-800">Wallet Connected</p>
                          <CopyableAddress address={address!} truncate className="text-xs text-green-600" />
                        </div>
                        <button
                          onClick={() => disconnect()}
                          className="text-xs text-green-600 hover:text-green-800 underline"
                        >
                          Disconnect
                        </button>
                      </div>

                      <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800">
                        <p className="font-medium mb-1">Next: Verify ownership</p>
                        <p className="text-amber-600">
                          Sign a message with your wallet to prove you own this address.
                          No gas fees or transactions are involved.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <Link href="/issuer/overview">
                          <Button variant="outline" type="button">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Back
                          </Button>
                        </Link>
                        <Button
                          variant="primary"
                          className="flex-1"
                          isLoading={loading}
                          onClick={handleVerify}
                        >
                          Sign to Verify
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Step 2: Review & Save ── */}
              {step === "verified" && verifiedAddress && (
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3 border border-green-200">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800">Ownership Verified</p>
                      <CopyableAddress address={verifiedAddress!} className="text-xs text-green-600" />
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                    <p className="font-medium mb-1">Save this wallet</p>
                    <p className="text-blue-600">
                      Review the wallet address above. You can discard and connect a different wallet,
                      or save this one. You&apos;ll submit for admin approval from the dashboard once all steps are complete.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" type="button" onClick={handleDiscard}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Discard & Reconnect
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      isLoading={loading}
                      onClick={handleSubmit}
                    >
                      Save Wallet
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
