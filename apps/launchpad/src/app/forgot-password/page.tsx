"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import Image from "next/image";
import { Button, Input } from "@/components/atoms";
import { forgotPassword } from "@/lib/api/repositories/auth.repository";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-box flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={120} height={32} className="h-8 w-auto mx-auto" />
          </Link>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-black/10 shadow-card">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text mb-2">Check Your Email</h2>
              <p className="text-gray-500 mb-6">
                {"If an account exists for "}
                <strong>{email}</strong>
                {", we've sent password reset instructions."}
              </p>
              <Link href="/login">
                <Button variant="primary" className="w-full">
                  Back to Login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-text mb-2">Forgot Password</h2>
              <p className="text-gray-500 mb-6">
                {"Enter your email and we'll send you a link to reset your password."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={loading || !email}
                  leftIcon={<Mail className="h-4 w-4" />}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>

              <Link
                href="/login"
                className="flex items-center justify-center gap-2 mt-6 text-sm text-darkAqua hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
