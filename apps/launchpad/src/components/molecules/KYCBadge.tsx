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
    colors: "bg-gray-100 text-gray-600 border-gray-200",
  },
  pending: {
    icon: Clock,
    label: "Pending review",
    colors: "bg-darkAqua/10 text-darkAqua border-darkAqua/30",
  },
  approved: {
    icon: ShieldCheck,
    label: "Verified",
    colors: "bg-green-100 text-green-700 border-green-200",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    colors: "bg-red-100 text-red-700 border-red-200",
  },
  expired: {
    icon: AlertCircle,
    label: "Expired",
    colors: "bg-orange-500/10 border-orange-500/20 text-orange-400",
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
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-darkAqua text-white font-semibold">
          Level {level}
        </span>
      )}
    </div>
  );
}
