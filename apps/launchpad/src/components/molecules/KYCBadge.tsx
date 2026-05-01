"use client";

import React from "react";
import { AlertCircle, Clock, Shield, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type KYCStatus = "none" | "pending" | "approved" | "rejected" | "expired";

export interface KYCBadgeProps {
  status: KYCStatus;
  level?: number;
  className?: string;
  showLevel?: boolean;
}

const STATUS_CONFIG = {
  none: {
    icon: Shield,
    label: "Not Started",
    colors: "bg-box text-black/60 border-black/10",
  },
  pending: {
    icon: Clock,
    label: "Pending review",
    colors: "bg-darkAqua/10 text-darkAqua border-darkAqua/30",
  },
  approved: {
    icon: ShieldCheck,
    label: "Verified",
    colors: "bg-darkAqua text-white border-darkAqua",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    colors: "bg-text/5 text-text border-text/20",
  },
  expired: {
    icon: AlertCircle,
    label: "Expired",
    colors: "bg-text/5 text-text border-text/20",
  },
};

export function KYCBadge({
  status,
  level = 0,
  className,
  showLevel = true,
}: KYCBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-xl border",
        config.colors,
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{config.label}</span>
      {showLevel && status === "approved" && level > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
          Level {level}
        </span>
      )}
    </div>
  );
}
