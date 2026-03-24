"use client";

import { Shield, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

export type KYCStatus = "none" | "pending" | "approved" | "rejected" | "expired";

export interface KYCBadgeProps {
  status: KYCStatus;
  level?: number;
  showLevel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusConfig = {
  none: {
    icon: Shield,
    label: "Not Verified",
    color: "text-gray-400",
    bgColor: "bg-gray-100",
  },
  pending: {
    icon: ShieldAlert,
    label: "Pending",
    color: "text-gold",
    bgColor: "bg-gold/10",
  },
  approved: {
    icon: ShieldCheck,
    label: "Verified",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  rejected: {
    icon: ShieldX,
    label: "Rejected",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  expired: {
    icon: ShieldAlert,
    label: "Expired",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
};

export function KYCBadge({
  status,
  level,
  showLevel = true,
  size = "md",
  className,
}: KYCBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.none;
  const Icon = config.icon;

  const sizes = {
    sm: "text-xs px-2 py-1 gap-1",
    md: "text-sm px-3 py-1.5 gap-1.5",
    lg: "text-base px-4 py-2 gap-2",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bgColor,
        config.color,
        sizes[size],
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      <span>{config.label}</span>
      {showLevel && status === "approved" && level !== undefined && (
        <span className="ml-1 px-1.5 py-0.5 bg-white/50 rounded-full text-xs">
          {level === 4 ? "Corporate" : level === 1 ? "Basic" : `L${level}`}
        </span>
      )}
    </div>
  );
}
