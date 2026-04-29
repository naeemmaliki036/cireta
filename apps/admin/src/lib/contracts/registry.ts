// Single source of truth for platform contract addresses shown in admin UI.
// Addresses are read from build-time NEXT_PUBLIC_* env vars set in Vercel.

export type ContractSection =
  | "Identity & Compliance"
  | "Factories"
  | "Compliance Modules"
  | "Platform";

export interface ContractEntry {
  label: string;
  description: string;
  address: string;
  section: ContractSection;
}

const ENV = process.env;

export const PLATFORM_CONTRACTS: ContractEntry[] = [
  // ── Identity & Compliance ───────────────────────────────────────────────
  {
    label: "Identity Registry",
    description:
      "On-chain whitelist of KYC-verified investor wallets. Required for any token transfer.",
    address: ENV.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "",
    section: "Identity & Compliance",
  },
  {
    label: "Issuer Registry",
    description:
      "Records active issuers authorized to deploy tokens and run sales on the platform.",
    address: ENV.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS ?? "",
    section: "Identity & Compliance",
  },

  // ── Factories ───────────────────────────────────────────────────────────
  {
    label: "Token Factory",
    description: "Deploys new ERC-3643 security tokens with the issuer as owner.",
    address: ENV.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS ?? "",
    section: "Factories",
  },
  {
    label: "Sale Factory",
    description: "Deploys primary-issuance sale contracts (with optional vault and vesting).",
    address: ENV.NEXT_PUBLIC_SALE_FACTORY_ADDRESS ?? "",
    section: "Factories",
  },
  {
    label: "OTC Token Factory",
    description: "Deploys OTC pool contracts for secondary-market trading of issuer tokens.",
    address: ENV.NEXT_PUBLIC_OTC_TOKEN_FACTORY_ADDRESS ?? "",
    section: "Factories",
  },

  // ── Compliance Modules ──────────────────────────────────────────────────
  {
    label: "Country Allow Module",
    description: "Allow-list of investor country codes permitted to hold the token.",
    address: ENV.NEXT_PUBLIC_COUNTRY_ALLOW_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Max Holder Count Module",
    description: "Caps the maximum number of distinct token holders.",
    address: ENV.NEXT_PUBLIC_MAX_HOLDER_COUNT_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Max Ownership Module",
    description: "Caps any single holder's ownership as a percentage of supply.",
    address: ENV.NEXT_PUBLIC_MAX_OWNERSHIP_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Max Balance Module",
    description: "Caps any single holder's balance as an absolute token amount.",
    address: ENV.NEXT_PUBLIC_MAX_BALANCE_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Lock Module",
    description: "Locks specific holder balances for a configured duration.",
    address: ENV.NEXT_PUBLIC_LOCK_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Whitelist Module",
    description: "Per-token whitelist enforced in addition to the global Identity Registry.",
    address: ENV.NEXT_PUBLIC_WHITELIST_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Conditional Transfer Module",
    description: "Requires explicit approval for individual transfer requests.",
    address: ENV.NEXT_PUBLIC_CONDITIONAL_TRANSFER_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Transfer Restrict Module",
    description: "Blocks transfers between specific source/destination address pairs.",
    address: ENV.NEXT_PUBLIC_TRANSFER_RESTRICT_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Time Locked Transfer Module",
    description: "Blocks transfers until a configured unlock timestamp.",
    address: ENV.NEXT_PUBLIC_TIME_LOCKED_TRANSFER_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },
  {
    label: "Time Transfers Limit Module",
    description: "Caps total transfer volume within a rolling time window.",
    address: ENV.NEXT_PUBLIC_TIME_TRANSFERS_LIMIT_MODULE_ADDRESS ?? "",
    section: "Compliance Modules",
  },

  // ── Platform ────────────────────────────────────────────────────────────
  {
    label: "Platform Fee Manager",
    description: "Records per-issuer platform fee rates and collects platform fees from sales.",
    address: ENV.NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS ?? "",
    section: "Platform",
  },
  {
    label: "USDC (Payment Token)",
    description: "Stablecoin accepted by sale and OTC contracts as payment.",
    address: ENV.NEXT_PUBLIC_USDC_ADDRESS ?? "",
    section: "Platform",
  },
];

export const SECTION_ORDER: ContractSection[] = [
  "Identity & Compliance",
  "Factories",
  "Compliance Modules",
  "Platform",
];

export function getContractsBySection(section: ContractSection): ContractEntry[] {
  return PLATFORM_CONTRACTS.filter((c) => c.section === section && c.address);
}

export function findContractByAddress(address: string): ContractEntry | undefined {
  if (!address) return undefined;
  const lc = address.toLowerCase();
  return PLATFORM_CONTRACTS.find((c) => c.address.toLowerCase() === lc);
}
