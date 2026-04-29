import { ExternalLink } from "lucide-react";
import { getAddressExplorerUrl } from "@/lib/contracts/explorer";

interface ExplorerLinkIconProps {
  address: string;
  label?: string;
  className?: string;
}

export function ExplorerLinkIcon({
  address,
  label = "View on block explorer",
  className = "",
}: ExplorerLinkIconProps) {
  if (!address) return null;
  return (
    <a
      href={getAddressExplorerUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center p-0.5 rounded text-zinc-400 hover:text-darkAqua hover:bg-zinc-200/50 transition-colors ${className}`}
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
