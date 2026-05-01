"use client";

/**
 * Shared primitives for address-based compliance module config panels.
 */

import { isAddress } from "viem";
import { Badge } from "@/components/atoms/Badge";
import { Input } from "@/components/atoms/Input";
import type { ComplianceModule } from "@/lib/api/repositories/token-compliance";

export interface ModuleConfigProps {
  module: ComplianceModule;
  complianceAddress: string;
  onRefresh: () => void;
}

interface StatusBadgeProps {
  status: boolean | undefined;
  activeLabel: string;
  inactiveLabel: string;
}

export function StatusBadge({ status, activeLabel, inactiveLabel }: StatusBadgeProps): React.ReactElement | null {
  if (status === undefined) return null;
  return status
    ? <Badge variant="success" size="sm">{activeLabel}</Badge>
    : <Badge variant="outline" size="sm">{inactiveLabel}</Badge>;
}

interface AddressFieldProps {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}

export function AddressField({ value, onChange, label, placeholder = "0x..." }: AddressFieldProps) {
  const error = value && !isAddress(value) ? "Invalid address" : undefined;
  return (
    <Input
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      error={error}
      className="font-mono text-xs"
    />
  );
}
