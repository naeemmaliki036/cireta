"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), { ssr: false });
import { Shield, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { initiateKYC, getKYCStatus } from "@/lib/api/repositories/kyc.repository";
import { getAccessToken } from "@/lib/api/client";

type VerificationState = "loading" | "ready" | "processing" | "approved" | "error";

interface SumsubVerificationProps {
  className?: string;
}

export function SumsubVerification({ className }: SumsubVerificationProps) {
  const router = useRouter();
  const [state, setState] = useState<VerificationState>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch SDK token on mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setError("Please log in first");
      setState("error");
      return;
    }

    (async () => {
      try {
        // Check existing status first
        const status = await getKYCStatus(token);
        if (status.status === "approved") {
          setState("approved");
          return;
        }

        // Initiate and get SDK token
        const result = await initiateKYC(token);
        setAccessToken(result.access_token);
        setState("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to start verification";
        // If already pending, show processing
        if (msg.includes("pending") || msg.includes("APPLICATION_PENDING")) {
          setState("processing");
        } else if (msg.includes("ALREADY_VERIFIED")) {
          setState("approved");
        } else {
          setError(msg);
          setState("error");
        }
      }
    })();
  }, []);

  const handleMessage = useCallback(
    (type: string) => {
      if (
        type === "idCheck.applicantReviewComplete" ||
        type === "idCheck.onApplicantStatusChanged"
      ) {
        setState("processing");
        // Poll for final status after a short delay
        setTimeout(async () => {
          const token = getAccessToken();
          if (!token) return;
          try {
            const status = await getKYCStatus(token);
            if (status.status === "approved") {
              setState("approved");
              setTimeout(() => router.push("/explore"), 2000);
            }
          } catch {
            // Keep processing state
          }
        }, 3000);
      }
    },
    [router],
  );

  const handleError = useCallback((err: unknown) => {
    console.error("Sumsub SDK error:", err);
    setError("Verification encountered an error. Please try again.");
    setState("error");
  }, []);

  if (state === "loading") {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <Spinner size="lg" />
        <p className="mt-4 text-darkBlack/50">Preparing verification...</p>
      </div>
    );
  }

  if (state === "approved") {
    return (
      <div className={`text-center py-16 ${className}`}>
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-text mb-2">Identity Verified</h2>
        <p className="text-darkBlack/50 mb-8">Your KYC verification has been approved</p>
        <Button variant="primary" onClick={() => router.push("/explore")}>
          Start Investing
        </Button>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className={`text-center py-16 ${className}`}>
        <div className="w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-6">
          <Loader2 className="w-10 h-10 text-gold animate-spin" />
        </div>
        <h2 className="text-2xl font-semibold text-text mb-2">Under Review</h2>
        <p className="text-darkBlack/50 mb-8">
          Your documents are being reviewed. This usually takes a few minutes.
        </p>
        <Button variant="outline" onClick={() => router.push("/explore")}>
          Continue Browsing
        </Button>
      </div>
    );
  }

  if (state === "error" || !accessToken) {
    return (
      <div className={`text-center py-16 ${className}`}>
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-semibold text-text mb-2">Something Went Wrong</h2>
        <p className="text-darkBlack/50 mb-8">{error ?? "Unable to load verification"}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="text-center mb-8">
        <Shield className="w-12 h-12 text-darkAqua mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-text mb-2">Verify Your Identity</h2>
        <p className="text-darkBlack/50">Complete KYC verification to start investing</p>
      </div>
      <div className="rounded-2xl overflow-hidden border border-darkBlack/10 min-h-[500px]">
        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={() => initiateKYC(getAccessToken()!).then((r) => r.access_token)}
          config={{ lang: "en" }}
          options={{ addViewportTag: false, adaptIframeHeight: true }}
          onMessage={handleMessage}
          onError={handleError}
        />
      </div>
    </div>
  );
}
