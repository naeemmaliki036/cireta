"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect to the existing /verify page which has the full Sumsub KYC flow
export default function VerificationSettingsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/verify"); }, [router]);
  return <div className="text-white/40 text-sm">Redirecting to verification...</div>;
}
