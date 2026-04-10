"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/atoms";
import { SplitAuthLayout } from "@/components/templates";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleError = searchParams.get("error");

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(
    googleError ? "Google sign-in failed. Please try again or use email." : null
  );
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [resendLocked, setResendLocked] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (resendCountdown > 0) {
      countdownRef.current = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
      return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
    }
  }, [resendCountdown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevOtp(null);
    try {
      const res = await fetch("/api/auth/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message ?? "Failed to send code");
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setStep("otp");
      setResendCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || resendLocked) return;
    if (resendCount >= 2) {
      setResendLocked(true);
      setError("Too many attempts. Please wait 5 minutes before trying again.");
      setTimeout(() => { setResendLocked(false); setResendCount(0); setError(null); }, 5 * 60 * 1000);
      return;
    }
    setLoading(true);
    setError(null);
    setDevOtp(null);
    try {
      const res = await fetch("/api/auth/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message ?? "Failed to resend code");
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setResendCount((c) => c + 1);
      setResendCountdown(60);
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp, purpose: "login" }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail?.message ?? "Verification failed");
      }
      const redirectTo = searchParams.get("redirect") || "/projects";
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setLoading(false);
    }
  };

  return (
    <SplitAuthLayout
      title={step === "email" ? "Welcome Back" : "Enter Verification Code"}
      subtitle={step === "email" ? "Sign in to access your portfolio and investments" : `We sent a 6-digit code to ${email}`}
    >
      {/* Dev OTP Toast */}
      {devOtp && (
        <div className="fixed top-4 right-4 z-50 bg-amber-500 text-black px-4 py-3 rounded-xl shadow-lg">
          <p className="text-xs font-medium opacity-70">DEV MODE — OTP Code</p>
          <p className="text-2xl font-bold tracking-[0.3em]">{devOtp}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {step === "email" && (
        <form onSubmit={handleRequestOtp} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-text">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email" autoFocus
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pl-11 text-sm text-text placeholder:text-gray-400 focus:border-darkAqua focus:outline-none focus:ring-1 focus:ring-darkAqua transition-colors" />
            </div>
          </div>
          <Button type="submit" className="w-full btn-cta rounded-full" size="lg" isLoading={loading}>
            {loading ? "Sending verification code..." : "Send Verification Code"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div>
            <label htmlFor="otp" className="mb-2 block text-sm font-semibold text-text">Verification Code</label>
            <input id="otp" type="text" inputMode="numeric" maxLength={6} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" required autoFocus
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.3em] font-bold text-text placeholder:text-gray-400 focus:border-darkAqua focus:outline-none focus:ring-1 focus:ring-darkAqua transition-colors" />
          </div>
          <Button type="submit" className="w-full btn-cta rounded-full" size="lg"
            isLoading={loading} disabled={otp.length < 6}>
            {loading ? "Verifying..." : "Verify & Sign In"}
          </Button>
          <p className="text-center text-sm text-gray-400">
            Didn&apos;t receive it?{" "}
            {resendLocked ? (
              <span className="text-red-400">Locked — try again in 5 minutes</span>
            ) : resendCountdown > 0 ? (
              <span className="text-gray-300">Resend in {resendCountdown}s</span>
            ) : (
              <button type="button" onClick={handleResendOtp} disabled={loading} className="text-darkAqua hover:underline">
                Resend code
              </button>
            )}
          </p>
        </form>
      )}

      {/* Google SSO */}
      {step === "email" && (
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-3 text-gray-400">or continue with</span></div>
          </div>
          <a href="/api/auth/google"
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </a>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href={`/register?redirect=${encodeURIComponent(searchParams.get("redirect") || "/projects")}`} className="font-semibold text-darkAqua hover:underline">Create account</Link>
        </p>
      </div>
    </SplitAuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
