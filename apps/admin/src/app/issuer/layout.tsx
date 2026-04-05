"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/atoms";
import { getOnboardingStatus } from "@/lib/api/repositories/issuer-onboarding";

/** Pages accessible without completed onboarding */
const ALLOWED_PATHS = [
  "/issuer/overview",
  "/issuer/settings",
  "/issuer/onboarding",
];

function isAllowed(pathname: string): boolean {
  return ALLOWED_PATHS.some((p) => pathname.startsWith(p));
}

export default function IssuerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip guard for allowed pages
    if (isAllowed(pathname)) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    getOnboardingStatus()
      .then((status) => {
        if (cancelled) return;
        if (!status.can_deploy) {
          router.replace("/issuer/overview");
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // If we can't check status, redirect to overview as a safe default
          router.replace("/issuer/overview");
        }
      });

    return () => { cancelled = true; };
  }, [pathname, router]);

  if (!checked && !isAllowed(pathname)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}
