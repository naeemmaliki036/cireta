"use client";

import { useEffect } from "react";

export default function ClearPage() {
  useEffect(() => {
    // Clear all auth cookies
    document.cookie = "cireta_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    // Clear storage
    try { sessionStorage.clear(); } catch {}
    try {
      // Clear wagmi/wallet state
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("wagmi") || key.startsWith("cireta_") || key.startsWith("rk-")) {
          localStorage.removeItem(key);
        }
      });
    } catch {}

    // Redirect to home after cleanup
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Clearing session...</p>
        <p className="text-gray-400 text-sm mt-1">Redirecting to home page</p>
      </div>
    </div>
  );
}
