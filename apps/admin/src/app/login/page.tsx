"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Shield, Building2, ArrowLeft, Loader2 } from "lucide-react";

type Mode = "select" | "admin-otp" | "issuer-otp" | "issuer-register" | "verify";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("select");
  const [loginRole, setLoginRole] = useState<"admin" | "issuer">("issuer");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const requestOtp = async (purpose: string) => {
    setLoading(true);
    setError("");
    setDevOtp(null);
    try {
      const res = await fetch("/api/auth/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message ?? "Failed to send code");
      // Dev mode: show OTP as notification
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setMode("verify");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (purpose: string) => {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = { email, code: otp, purpose };
      if (purpose === "register" && displayName) body.display_name = displayName;

      const res = await fetch("/api/auth/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail?.message ?? "Verification failed");
      }
      router.push(loginRole === "admin" ? "/platform/overview" : "/issuer/overview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setEmail("");
    setOtp("");
    setDisplayName("");
    setError("");
    setDevOtp(null);
  };

  // ── Dev OTP Toast ──
  const DevOtpToast = devOtp ? (
    <div className="fixed top-4 right-4 z-50 bg-amber-500 text-black px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-2">
      <p className="text-xs font-medium opacity-70">DEV MODE — OTP Code</p>
      <p className="text-2xl font-bold tracking-[0.3em]">{devOtp}</p>
    </div>
  ) : null;

  // ── Role Selection ──
  if (mode === "select") {
    return (
      <div className="min-h-screen flex">
        {DevOtpToast}
        {/* Left branded panel */}
        <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex-col justify-between p-10">
          <div>
            <Image src="/cireta-logo-white.svg" alt="Cireta" width={140} height={40} className="h-10 w-auto" priority />
          </div>
          <div>
            <p className="text-white/90 text-2xl font-light leading-relaxed max-w-md">
              Regulated commodity tokenization — one platform for issuance, compliance, and distribution.
            </p>
            <p className="text-white/40 text-sm mt-4 flex items-center gap-2">
              <span className="w-8 h-px bg-white/30" /> Admin Portal
            </p>
          </div>
          <p className="text-white/20 text-xs">&copy; {new Date().getFullYear()} Cireta. All rights reserved.</p>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-md space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Welcome back</h1>
              <p className="text-zinc-500 mt-1">Select your role to continue</p>
            </div>
            <div className="space-y-4">
              <button
                onClick={() => { reset(); setLoginRole("admin"); setMode("admin-otp"); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-blue-400 hover:shadow-sm transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900">Platform Admin</h2>
                  <p className="text-sm text-zinc-400">Manage issuers, compliance, settings</p>
                </div>
              </button>
              <button
                onClick={() => { reset(); setLoginRole("issuer"); setMode("issuer-otp"); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-teal-400 hover:shadow-sm transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900">Issuer</h2>
                  <p className="text-sm text-zinc-400">Create and manage tokenized assets</p>
                </div>
              </button>
            </div>
            <p className="text-center text-zinc-400 text-xs">
              Access is by invitation only. Contact your administrator for access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP Request (Email input) ──
  if (mode === "admin-otp" || mode === "issuer-otp") {
    const isIssuer = mode === "issuer-otp";
    return (
      <div className="min-h-screen flex">
        {DevOtpToast}
        <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex-col justify-between p-10">
          <Image src="/cireta-logo-white.svg" alt="Cireta" width={140} height={40} className="h-10 w-auto" priority />
          <div>
            <p className="text-white/90 text-2xl font-light leading-relaxed max-w-md">
              {isIssuer ? "Create and manage tokenized real-world assets on Base L2." : "Platform administration and compliance management."}
            </p>
          </div>
          <p className="text-white/20 text-xs">&copy; {new Date().getFullYear()} Cireta. All rights reserved.</p>
        </div>
        <div className="flex-1 flex items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-sm space-y-6">
            <button onClick={() => setMode("select")} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-700">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">{isIssuer ? "Issuer Login" : "Platform Admin"}</h1>
              <p className="text-zinc-500 text-sm mt-1">Enter your email to receive a verification code</p>
            </div>
            {error && <p className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); requestOtp("login"); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  isIssuer ? "bg-teal-600 hover:bg-teal-500 text-white" : "bg-zinc-900 hover:bg-zinc-800 text-white"
                }`}
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending verification code...</> : "Send Verification Code"}
              </button>
            </form>
            {isIssuer && (
              <div className="text-center pt-4 border-t border-zinc-200">
                <p className="text-zinc-400 text-sm">
                  New issuer?{" "}
                  <button onClick={() => { reset(); setMode("issuer-register"); }} className="text-teal-600 hover:underline font-medium">Register</button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── OTP Verify ──
  if (mode === "verify") {
    return (
      <div className="min-h-screen flex">
        {DevOtpToast}
        <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex-col justify-between p-10">
          <Image src="/cireta-logo-white.svg" alt="Cireta" width={140} height={40} className="h-10 w-auto" priority />
          <div>
            <p className="text-white/90 text-2xl font-light leading-relaxed max-w-md">Check your email for the verification code.</p>
          </div>
          <p className="text-white/20 text-xs">&copy; {new Date().getFullYear()} Cireta. All rights reserved.</p>
        </div>
        <div className="flex-1 flex items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Enter verification code</h1>
              <p className="text-zinc-500 text-sm mt-1">
                We sent a 6-digit code to <span className="font-medium text-zinc-700">{email}</span>
              </p>
            </div>
            {error && <p className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); verifyOtp("login"); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="000000"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : "Verify & Sign In"}
              </button>
            </form>
            <p className="text-center text-zinc-400 text-xs">
              Didn&apos;t receive it?{" "}
              <button onClick={() => requestOtp("login")} className="text-blue-600 hover:underline">Resend code</button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Issuer Registration (OTP-based) ──
  if (mode === "issuer-register") {
    return (
      <div className="min-h-screen flex">
        {DevOtpToast}
        <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex-col justify-between p-10">
          <Image src="/cireta-logo-white.svg" alt="Cireta" width={140} height={40} className="h-10 w-auto" priority />
          <div>
            <p className="text-white/90 text-2xl font-light leading-relaxed max-w-md">
              Launch tokenized real-world assets on a regulated platform.
            </p>
          </div>
          <p className="text-white/20 text-xs">&copy; {new Date().getFullYear()} Cireta. All rights reserved.</p>
        </div>
        <div className="flex-1 flex items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-sm space-y-6">
            <button onClick={() => { reset(); setMode("issuer-otp"); }} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-700">
              <ArrowLeft className="h-4 w-4" /> Back to Login
            </button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Issuer Registration</h1>
              <p className="text-zinc-500 text-sm mt-1">Create your issuer account</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-amber-700 text-xs">
                Requires pre-approval. Your email must be whitelisted by the platform admin before registering.
              </p>
            </div>
            {error && <p className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); requestOtp("register"); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Email (whitelisted)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500"
                  placeholder="Your name or company" required />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending verification code...</> : "Send Verification Code"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
