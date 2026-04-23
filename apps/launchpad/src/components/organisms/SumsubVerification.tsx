"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), { ssr: false });
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { initiateKYC, getKYCStatus } from "@/lib/api/repositories/kyc.repository";
import { useAuth } from "@/contexts/AuthContext";

type VerificationState = "loading" | "ready" | "processing" | "approved" | "error";

const SDK_WATCHDOG_MS = 30_000;

interface SumsubVerificationProps {
  className?: string;
}

export function SumsubVerification({ className }: SumsubVerificationProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<VerificationState>("loading");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sdkMounted, setSdkMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Idempotency guard — StrictMode double-fires the init effect in dev;
  // without this we open two Sumsub applicants and race their tokens.
  const initStartedRef = useRef(false);

  // Fast-path: if auth context already knows KYC is approved, skip API calls
  useEffect(() => {
    if (user?.kycStatus === "approved") {
      setState("approved");
    }
  }, [user?.kycStatus]);

  // Fetch SDK token on mount (auth handled by httpOnly cookie via proxy).
  // We intentionally DO NOT short-circuit on unmount here — StrictMode's
  // synthetic mount → unmount → remount pattern would otherwise leave the
  // component stuck in "loading" because the first run's cancelled flag
  // suppresses setState while the idempotency guard blocks the second run.
  // Safe because setState on an unmounted component is a no-op warning in
  // React 18+, not an error.
  useEffect(() => {
    if (user?.kycStatus === "approved") return;
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    (async () => {
      try {
        const kycStatus = await getKYCStatus("");
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

      try {
        const result = await initiateKYC("");
        setAccessToken(result.access_token);
        setState("ready");
      } catch (err) {
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
  }, [user?.kycStatus]);

  // Watchdog: if the Sumsub iframe hasn't reported mounted within SDK_WATCHDOG_MS,
  // surface a recoverable error instead of leaving the user on a frozen-looking page.
  useEffect(() => {
    if (state !== "ready") return;
    if (sdkMounted) return;
    const timer = window.setTimeout(() => {
      setError(
        "Verification widget took too long to load. Check your network connection and try again.",
      );
      setState("error");
    }, SDK_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [state, sdkMounted]);

  const handleMessage = useCallback(
    (type: string) => {
      // First message from the SDK = iframe successfully mounted; clear the watchdog.
      setSdkMounted(true);
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

  // Expiration handler returns the existing applicant's refreshed token.
  // If initiateKYC is called after one already exists the backend replies
  // with APPLICATION_PENDING (409). Swallow that so the SDK doesn't retry
  // on a rejected promise, which can deadlock the widget.
  const handleExpiration = useCallback(async () => {
    try {
      const result = await initiateKYC("");
      return result.access_token;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      const msg = err instanceof Error ? err.message : "";
      if (code === "APPLICATION_PENDING" || msg.includes("pending")) {
        setState("processing");
      }
      return accessToken ?? "";
    }
  }, [accessToken]);

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
      <div className="relative rounded-2xl overflow-hidden border border-black/10 min-h-[780px]">
        {!sdkMounted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm pointer-events-none z-10">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-black/50">Loading verification widget…</p>
          </div>
        )}
        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={handleExpiration}
          config={{
            lang: "en",
            uiConf: {
              // Only hide the Sumsub branding bar. Earlier selectors for
              // the reuse-account flow were hiding the content body but
              // leaving the Continue button + footer dangling — a "broken
              // sliver" UI. Let Sumsub render that screen fully; to stop
              // it from appearing at all, disable reusable KYC on the
              // verification level in the Sumsub dashboard.
              customCssStr: `
                .sumsub-logo, .powered-by { display: none !important; }
              `,
            },
          }}
          // adaptIframeHeight=true lets Sumsub resize the iframe to match
          // its internal content height, so the container grows naturally
          // instead of clipping. Combined with the min-h above it also
          // prevents the initial shrink-then-expand jump.
          options={{ addViewportTag: false, adaptIframeHeight: true }}
          onMessage={handleMessage}
          onError={handleError}
        />
      </div>
    </div>
  );
}
