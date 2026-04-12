/**
 * Registry of all 11 on-chain compliance modules.
 *
 * Only modules with a NEXT_PUBLIC_ env address are considered "deployed".
 * The rest are shown as "not deployed" in the admin UI.
 */

import type { LucideIcon } from "lucide-react";
import {
  Globe, Users, Shield, Lock, Wallet, Clock, Timer,
  ArrowLeftRight, CheckSquare, Link2, Activity,
} from "lucide-react";

export interface ComplianceModuleInfo {
  /** Unique key */
  id: string;
  /** Contract name from Solidity */
  contractName: string;
  /** Display name */
  name: string;
  /** Short description for the card */
  description: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tag label (e.g. "Regulatory", "Risk", "Access") */
  tag: string;
  /** Tag color classes */
  tagColor: string;
  /** Deployed on-chain address, empty string if not deployed */
  address: string;
  /** Whether the module has a sub-config UI */
  hasConfig: boolean;
}

/**
 * All 11 compliance modules from contracts/src/compliance/.
 * Deployed addresses come from NEXT_PUBLIC_ env vars set at build time.
 */
export const ALL_COMPLIANCE_MODULES: ComplianceModuleInfo[] = [
  {
    id: "country_allow",
    contractName: "CountryAllowModule",
    name: "Country Allow List",
    description:
      "Only wallets from approved countries can hold or receive tokens. Configure allowed countries after attaching.",
    icon: Globe,
    tag: "Regulatory",
    tagColor: "bg-blue-100 text-blue-700",
    address: process.env.NEXT_PUBLIC_COUNTRY_ALLOW_MODULE_ADDRESS || "",
    hasConfig: true,
  },
  {
    id: "max_holders",
    contractName: "MaxHolderCountModule",
    name: "Max Holder Count",
    description:
      "Limits the total number of unique token holders. New transfers are blocked once the cap is reached.",
    icon: Users,
    tag: "Regulatory",
    tagColor: "bg-blue-100 text-blue-700",
    address: process.env.NEXT_PUBLIC_MAX_HOLDER_COUNT_MODULE_ADDRESS || "",
    hasConfig: true,
  },
  {
    id: "max_balance",
    contractName: "MaxBalanceModule",
    name: "Max Balance",
    description:
      "Caps the maximum token balance per address. Transfers that would exceed the cap are blocked.",
    icon: Wallet,
    tag: "Risk",
    tagColor: "bg-amber-100 text-amber-700",
    address: process.env.NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "max_ownership",
    contractName: "MaxOwnershipModule",
    name: "Max Ownership %",
    description:
      "Limits the maximum percentage of total supply any single address can hold.",
    icon: Shield,
    tag: "Risk",
    tagColor: "bg-amber-100 text-amber-700",
    address: process.env.NEXT_PUBLIC_MAX_OWNERSHIP_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "lock",
    contractName: "LockModule",
    name: "Address Lock",
    description:
      "Lock specific addresses from transferring tokens out. Useful for vesting or dispute resolution.",
    icon: Lock,
    tag: "Access",
    tagColor: "bg-purple-100 text-purple-700",
    address: process.env.NEXT_PUBLIC_LOCK_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "whitelist",
    contractName: "WhitelistModule",
    name: "Whitelist",
    description:
      "Only whitelisted addresses can hold tokens. Stricter than country allow — per-address approval.",
    icon: CheckSquare,
    tag: "Access",
    tagColor: "bg-purple-100 text-purple-700",
    address: process.env.NEXT_PUBLIC_WHITELIST_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "transfer_restrict",
    contractName: "TransferRestrictModule",
    name: "Transfer Restrict",
    description:
      "Whitelist-based transfer restrictions. Only pre-approved sender/receiver pairs can transfer.",
    icon: ArrowLeftRight,
    tag: "Access",
    tagColor: "bg-purple-100 text-purple-700",
    address: process.env.NEXT_PUBLIC_TRANSFER_RESTRICT_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "conditional_transfer",
    contractName: "ConditionalTransferModule",
    name: "Conditional Transfer",
    description:
      "Transfers require pre-approval. Useful for OTC or regulated secondary market trades.",
    icon: Link2,
    tag: "Access",
    tagColor: "bg-purple-100 text-purple-700",
    address:
      process.env.NEXT_PUBLIC_CONDITIONAL_TRANSFER_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "time_locked",
    contractName: "TimeLockedTransferModule",
    name: "Time-Locked Transfer",
    description:
      "Transfers only allowed after a specific unlock timestamp. Useful for launch lockup periods.",
    icon: Clock,
    tag: "Time",
    tagColor: "bg-green-100 text-green-700",
    address:
      process.env.NEXT_PUBLIC_TIME_LOCKED_TRANSFER_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "time_transfers_limit",
    contractName: "TimeTransfersLimitModule",
    name: "Time Transfer Limit",
    description:
      "Limits the number or volume of transfers within a time window (e.g. daily transfer cap).",
    icon: Timer,
    tag: "Time",
    tagColor: "bg-green-100 text-green-700",
    address:
      process.env.NEXT_PUBLIC_TIME_TRANSFERS_LIMIT_MODULE_ADDRESS || "",
    hasConfig: false,
  },
  {
    id: "chainlink_por",
    contractName: "ChainlinkPoRChecker",
    name: "Chainlink Proof of Reserve",
    description:
      "Blocks transfers if Chainlink PoR feed shows zero/negative reserves or stale data (>24h).",
    icon: Activity,
    tag: "Oracle",
    tagColor: "bg-cyan-100 text-cyan-700",
    address: process.env.NEXT_PUBLIC_CHAINLINK_POR_MODULE_ADDRESS || "",
    hasConfig: false,
  },
];

/** Only modules that have a deployed address */
export function getDeployedModules(): ComplianceModuleInfo[] {
  return ALL_COMPLIANCE_MODULES.filter((m) => !!m.address);
}

/** Only modules that are NOT deployed */
export function getUndeployedModules(): ComplianceModuleInfo[] {
  return ALL_COMPLIANCE_MODULES.filter((m) => !m.address);
}
