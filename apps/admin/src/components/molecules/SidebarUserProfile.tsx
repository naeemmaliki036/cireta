"use client";

import { LogOut } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const ROLE_LABELS: Record<string, string> = {
  admin: "Platform Admin",
  issuer: "Issuer",
  investor: "Buyer",
};

export function SidebarUserProfile() {
  const user = useCurrentUser();

  const initials = user?.display_name
    ? user.display_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  };

  return (
    <div className="pt-4 mt-3 border-t border-zinc-200">
      <div className="flex items-center gap-2.5 px-2">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-zinc-500">{initials}</span>
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900 truncate leading-tight">
            {user?.display_name || "Loading..."}
          </p>
          <p className="text-[11px] text-zinc-400 truncate leading-tight" title={user?.email}>
            {user?.email ?? ""}
          </p>
          <p className="text-[10px] text-zinc-400 leading-tight">
            {ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? ""}
          </p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
