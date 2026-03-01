"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { CiretaLogo } from "@/components/atoms";
import { resetPassword } from "@/lib/api/repositories/auth.repository";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!token) { setError("Invalid or expired reset link."); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch {
      setError("Link is invalid or expired. Please request a new one.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center py-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">Invalid Link</h2>
        <p className="text-gray-500 mb-6">This password reset link is missing or malformed.</p>
        <Link href="/forgot-password">
          <Button variant="primary" className="w-full">Request New Link</Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-text mb-2">Password Reset</h2>
        <p className="text-gray-500 mb-6">Your password has been updated successfully.</p>
        <Link href="/login">
          <Button variant="primary" className="w-full">Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-text mb-2">Reset Password</h2>
      <p className="text-gray-500 mb-6">Enter your new password below.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password" label="New Password" placeholder="At least 8 characters"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        <Input
          type="password" label="Confirm Password" placeholder="Repeat password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <Button
          type="submit" variant="primary" className="w-full"
          disabled={loading || !password || !confirm}
          leftIcon={<Lock className="h-4 w-4" />}
        >
          {loading ? "Resetting..." : "Reset Password"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-box flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <CiretaLogo variant="full" color="dark" className="h-8 mx-auto" />
          </Link>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-darkBlack/10 shadow-card">
          <Suspense fallback={<p className="text-center text-gray-500">Loading...</p>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
