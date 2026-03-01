"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Button } from "@/components/atoms";
import { SplitAuthLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service");
      return;
    }

    setIsSubmitting(true);

    try {
      await register(formData.email, formData.password);
      router.push("/verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SplitAuthLayout
      title="Create Account"
      subtitle="Start investing in tokenized real-world assets"
    >
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-text"
          >
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="input-field pl-12"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-semibold text-text"
          >
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a strong password"
              required
              autoComplete="new-password"
              className="input-field pl-12 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            At least 8 characters with uppercase, lowercase, and number
          </p>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-sm font-semibold text-text"
          >
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              className="input-field pl-12"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="w-4 h-4 mt-1 rounded border-gray-300 text-darkAqua focus:ring-darkAqua"
          />
          <span className="text-sm text-gray-600">
            I agree to the{" "}
            <Link
              href="https://cireta.com/terms-of-service"
              target="_blank"
              className="text-darkAqua hover:underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="https://cireta.com/privacy-policy"
              target="_blank"
              className="text-darkAqua hover:underline"
            >
              Privacy Policy
            </Link>
          </span>
        </label>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isSubmitting}
        >
          Create Account
        </Button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-darkAqua hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </SplitAuthLayout>
  );
}
