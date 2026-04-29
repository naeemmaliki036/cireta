import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { ExplorerLinkIcon } from "@/components/atoms/ExplorerLinkIcon";

interface ContractAddressRowProps {
  label: string;
  description?: string;
  address: string;
}

export function ContractAddressRow({ label, description, address }: ContractAddressRowProps) {
  if (!address) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-3 md:gap-4 items-start py-3 border-b border-zinc-100 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-darkAqua">{label}</div>
        {description ? (
          <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</div>
        ) : null}
      </div>
      <div className="text-xs text-zinc-700 min-w-0">
        <CopyableAddress address={address} />
      </div>
      <div className="flex items-center justify-end">
        <ExplorerLinkIcon address={address} />
      </div>
    </div>
  );
}
