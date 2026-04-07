"use client";

import React from "react";
import { motion } from "framer-motion";
import { Lock, Unlock, ArrowRightLeft, RefreshCw, Pause, Play, Shield } from "lucide-react";
import { Badge } from "@/components/atoms";
import { cn, formatRelativeTime, truncateAddress } from "@/lib/utils";

export type ComplianceAction =
  | "freeze"
  | "unfreeze"
  | "forced_transfer"
  | "recover"
  | "pause"
  | "unpause";

export interface AuditLogRowProps {
  action: ComplianceAction;
  actorWallet: string;
  targetWallet?: string;
  targetType: string;
  timestamp: string;
  details?: string;
  index?: number;
}

const actionConfig: Record<ComplianceAction, { icon: React.ElementType; label: string; color: string }> = {
  freeze: { icon: Lock, label: "Freeze", color: "text-red-600" },
  unfreeze: { icon: Unlock, label: "Unfreeze", color: "text-green-600" },
  forced_transfer: { icon: ArrowRightLeft, label: "Forced Transfer", color: "text-gold" },
  recover: { icon: RefreshCw, label: "Recover", color: "text-purple-600" },
  pause: { icon: Pause, label: "Pause Token", color: "text-red-600" },
  unpause: { icon: Play, label: "Unpause Token", color: "text-green-600" },
};

export function AuditLogRow({
  action,
  actorWallet,
  targetWallet,
  targetType,
  timestamp,
  details,
  index = 0,
}: AuditLogRowProps) {
  const config = actionConfig[action] ?? { icon: Shield, label: action, color: "text-gray-600" };
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-4 p-4 rounded-lg bg-box/50 hover:bg-box transition-colors"
    >
      <div className={cn("p-2 rounded-lg bg-white", config.color)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("font-semibold", config.color)}>{config.label}</span>
          <Badge variant="outline" size="sm">{targetType}</Badge>
        </div>

        <div className="text-sm text-gray-500 space-y-1">
          <p>
            By: <code className="font-mono">{truncateAddress(actorWallet)}</code>
          </p>
          {targetWallet && (
            <p>
              Target: <code className="font-mono">{truncateAddress(targetWallet)}</code>
            </p>
          )}
          {details && <p className="text-gray-600">{details}</p>}
        </div>
      </div>

      <div className="text-right text-sm text-gray-400 whitespace-nowrap">
        {formatRelativeTime(timestamp)}
      </div>
    </motion.div>
  );
}
