"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Redirect non-admins to /issuer/overview. Returns {isAdmin, ready}:
 *  - ready=false while the role is still loading
 *  - isAdmin=true → caller renders the page
 *  - isAdmin=false → effect has already kicked off the redirect; caller
 *    should bail with a small placeholder
 */
export function useAdminGuard(): { isAdmin: boolean; ready: boolean } {
  const router = useRouter();
  const user = useCurrentUser();
  const ready = user !== null;
  const isAdmin = ready && user!.role === "admin";

  useEffect(() => {
    if (ready && !isAdmin) {
      router.replace("/issuer/overview");
    }
  }, [ready, isAdmin, router]);

  return { isAdmin, ready };
}
