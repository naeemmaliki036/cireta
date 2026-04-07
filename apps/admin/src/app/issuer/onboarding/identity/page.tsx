"use client";

import { useState, useEffect } from "react";
import { Shield, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { initiateIdentity, getIdentityStatus } from "@/lib/api/repositories/issuer-onboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react").then((m: any) => m.default), { ssr: false }) as any;

type State = "loading" | "ready" | "sdk" | "processing" | "approved" | "rejected" | "error";

export default function IdentityOnboardingPage() {
  const [state, setState] = useState<State>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [verificationType, setVerificationType] = useState<"kyc" | "kyb">("kyc");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const status = await getIdentityStatus();
        setVerificationType(status.verification_type);
        if (status.identity_status === "approved") { setState("approved"); return; }
        if (status.identity_status === "pending") { setState("processing"); return; }
        if (status.identity_status === "rejected") { setState("rejected"); return; }
        setState("ready");
      } catch {
        setState("ready");
      }
    })();
  }, []);

  const startVerification = async () => {
    try {
      const data = await initiateIdentity();
      setAccessToken(data.access_token);
      setVerificationType(data.verification_type);
      setState("sdk");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start verification");
      setState("error");
    }
  };

  const label = verificationType === "kyb" ? "Corporate KYB" : "Individual KYC";

  return (
    <IssuerDashboardLayout
      title={`Identity Verification (${label})`}
      description="Complete your identity verification via Sumsub"
    >
      <div className="max-w-2xl mx-auto">
        {state === "loading" && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
          </div>
        )}

        {state === "ready" && (
          <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-6">
            <div className="w-16 h-16 rounded-md bg-teal-50 flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold">{label} Verification</h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">
              {verificationType === "kyb"
                ? "You'll need to provide company registration documents, director information, and UBO details."
                : "You'll need a valid government-issued ID and a selfie for verification."
              }
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/issuer/overview">
                <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              </Link>
              <Button variant="primary" onClick={startVerification}>Start Verification</Button>
            </div>
          </div>
        )}

        {state === "sdk" && accessToken && (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <SumsubWebSdk
              accessToken={accessToken}
              expirationHandler={async () => {
                const data = await initiateIdentity();
                return data.access_token;
              }}
              onMessage={(type: string) => {
                if (type === "idCheck.applicantReviewComplete" || type === "idCheck.onApplicantStatusChanged") {
                  setTimeout(() => setState("processing"), 2000);
                }
              }}
              onError={(err: Error) => {
                setError(err.message);
                setState("error");
              }}
            />
          </div>
        )}

        {state === "processing" && (
          <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-4">
            <Loader2 className="h-10 w-10 text-amber-500 animate-spin mx-auto" />
            <h2 className="text-xl font-semibold">Under Review</h2>
            <p className="text-zinc-500 text-sm">
              Your {label.toLowerCase()} verification is being reviewed. This usually takes a few minutes.
            </p>
            <Link href="/issuer/overview">
              <Button variant="outline" className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        )}

        {state === "approved" && (
          <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">Identity Verified</h2>
            <p className="text-zinc-500 text-sm">Your {label.toLowerCase()} verification is complete.</p>
            <Link href="/issuer/overview">
              <Button variant="primary" className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        )}

        {state === "rejected" && (
          <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-md bg-red-50 flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold">Verification Rejected</h2>
            <p className="text-zinc-500 text-sm">Your verification was not approved. Please contact support.</p>
            <Link href="/issuer/overview">
              <Button variant="outline" className="mt-4">Back to Dashboard</Button>
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-4">
            <p className="text-red-500 text-sm">{error}</p>
            <Button variant="primary" onClick={() => setState("ready")}>Retry</Button>
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
