"use client";

import { PlatformAdminLayout } from "@/components/templates";
import { ContractAddressRow } from "@/components/molecules/ContractAddressRow";
import {
  PLATFORM_CONTRACTS,
  SECTION_ORDER,
  getContractsBySection,
  type ContractSection,
} from "@/lib/contracts/registry";
import { ExternalLink } from "lucide-react";
import { getExplorerBaseUrl } from "@/lib/contracts/explorer";

const SECTION_DESCRIPTIONS: Record<ContractSection, string> = {
  "Identity & Compliance":
    "Core registries enforcing who can hold tokens and who can issue them.",
  Factories:
    "Deployer contracts that create per-issuer tokens, sales, and OTC pools.",
  "Compliance Modules":
    "Plug-in modules an issuer can attach to a token's ModularCompliance to enforce transfer rules.",
  Platform: "Shared utilities used across all issuers.",
};

function chainName(): string {
  const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  return (
    {
      1: "Ethereum Mainnet",
      8453: "Base Mainnet",
      84532: "Base Sepolia (testnet)",
      11155111: "Sepolia (testnet)",
    }[id] ?? `Chain ${id}`
  );
}

export default function SmartContractsPage() {
  const explorerBase = getExplorerBaseUrl();
  const totalConfigured = PLATFORM_CONTRACTS.filter((c) => c.address).length;

  return (
    <PlatformAdminLayout
      title="Smart Contracts"
      description="Reference of every platform contract address used by the Cireta launchpad"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Smart Contracts" },
      ]}
    >
      {/* Network banner */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-[var(--brand-light)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-700">
          <span className="font-semibold text-darkAqua">Network:</span> {chainName()}
          <span className="mx-2 text-zinc-300">·</span>
          <span className="font-semibold text-darkAqua">Configured contracts:</span>{" "}
          {totalConfigured} / {PLATFORM_CONTRACTS.length}
        </div>
        <a
          href={explorerBase}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-darkAqua hover:underline"
        >
          Open block explorer <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {SECTION_ORDER.map((section) => {
          const rows = getContractsBySection(section);
          if (rows.length === 0) return null;
          return (
            <section
              key={section}
              className="rounded-lg border border-zinc-200 bg-white overflow-hidden"
            >
              <header className="px-4 py-3 border-b border-zinc-100 bg-zinc-50">
                <h2 className="text-sm font-semibold text-darkAqua">{section}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{SECTION_DESCRIPTIONS[section]}</p>
              </header>
              <div className="px-4">
                {rows.map((c) => (
                  <ContractAddressRow
                    key={c.label}
                    label={c.label}
                    description={c.description}
                    address={c.address}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Empty / warning fallback */}
      {totalConfigured === 0 ? (
        <div className="mt-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          No contract addresses are configured. Set the <code>NEXT_PUBLIC_*_ADDRESS</code>{" "}
          environment variables in this deployment.
        </div>
      ) : null}
    </PlatformAdminLayout>
  );
}
