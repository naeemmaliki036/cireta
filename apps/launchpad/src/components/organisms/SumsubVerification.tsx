"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), { ssr: false });
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { initiateKYC, getKYCStatus } from "@/lib/api/repositories/kyc.repository";
import { useAuth } from "@/contexts/AuthContext";

type VerificationState = "loading" | "ready" | "processing" | "approved" | "error";

interface SumsubVerificationProps {
  className?: string;
}

export function SumsubVerification({ className }: SumsubVerificationProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<VerificationState>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fast-path: if auth context already knows KYC is approved, skip API calls
  useEffect(() => {
    if (user?.kycStatus === "approved") {
      setState("approved");
    }
  }, [user?.kycStatus]);

  // Fetch SDK token on mount (auth handled by httpOnly cookie via proxy)
  useEffect(() => {
    // Skip if auth context already says approved
    if (user?.kycStatus === "approved") return;

    let cancelled = false;
    (async () => {
      try {
        const kycStatus = await getKYCStatus("");
        if (cancelled) return;
        if (kycStatus.status === "approved") {
          setState("approved");
          return;
        }
        if (kycStatus.status === "pending") {
          setState("processing");
          return;
        }
      } catch {
        // Status endpoint failed — continue to initiate
      }

      if (cancelled) return;

      try {
        const result = await initiateKYC("");
        if (cancelled) return;
        setAccessToken(result.access_token);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to start verification";
        const code = (err as { code?: string }).code ?? "";
        if (code === "ALREADY_VERIFIED" || msg.includes("already approved")) {
          setState("approved");
        } else if (code === "APPLICATION_PENDING" || msg.includes("pending")) {
          setState("processing");
        } else {
          setError(msg);
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.kycStatus]);

  const handleMessage = useCallback(
    (type: string) => {
      if (
        type === "idCheck.applicantReviewComplete" ||
        type === "idCheck.onApplicantStatusChanged"
      ) {
        setState("processing");
        // Poll for final status after a short delay
        setTimeout(async () => {
          try {
            const status = await getKYCStatus("");
            if (status.status === "approved") {
              setState("approved");
              setTimeout(() => router.push("/projects"), 2000);
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
        <p className="mt-4 text-black/50">Preparing verification...</p>
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
        <p className="text-black/50 mb-8">Your KYC verification has been approved</p>
        <Button variant="primary" onClick={() => router.push("/projects")}>
          Start Investing
        </Button>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className={`text-center py-16 ${className}`}>
        <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
          <Loader2 className="w-10 h-10 text-darkAqua animate-spin" />
        </div>
        <h2 className="text-2xl font-semibold text-text mb-2">Under Review</h2>
        <p className="text-black/50 mb-8">
          Your documents are being reviewed. This usually takes a few minutes but can take up to 24 hours.
          <br />In case of delay, contact <a href="https://cireta.com" target="_blank" rel="noopener noreferrer" className="text-darkAqua underline hover:text-darkAqua/80">compliance@cireta.com</a>.
        </p>
        <Button variant="outline" onClick={() => router.push("/projects")}>
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
        <p className="text-black/50 mb-8">{error ?? "Unable to load verification"}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-2xl overflow-hidden border border-black/10 min-h-[600px]">
        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={() => initiateKYC("").then((r) => r.access_token)}
          config={{
            lang: "en",
            uiConf: {
              customCssStr: `
                .sumsub-logo, .powered-by { display: none !important; }
                #sumsub-websdk-reuse-account-container { display: none !important; }
                .reuse-account, .reuse-account-container { display: none !important; }
                [class*="reuse"], [class*="ReuseAccount"] { display: none !important; }
              `,
            },
          }}
          options={{ addViewportTag: false, adaptIframeHeight: true }}
          onMessage={handleMessage}
          onError={handleError}
        />
      </div>
    </div>
  );
}
