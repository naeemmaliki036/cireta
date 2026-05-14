"use client";

import { ExternalLink } from "lucide-react";
import { Button, Textarea } from "@/components/atoms";

/* ------------------------------------------------------------------ */
/* OnChainContent — inner panel shown when type === "on_chain"          */
/* ------------------------------------------------------------------ */

export interface OnChainContentProps {
  hasManager: boolean;
  managerAddress: string;
  rmExplorerUrl: string | null;
  tokenDeployed: boolean;
  onOpenDeploy: () => void;
  description: string;
  onDescriptionChange: (v: string) => void;
}

export function OnChainContent({
  hasManager,
  managerAddress,
  rmExplorerUrl,
  tokenDeployed,
  onOpenDeploy,
  description,
  onDescriptionChange,
}: OnChainContentProps) {
  return (
    <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
      {hasManager ? (
        <ManagerAddressDisplay
          address={managerAddress}
          explorerUrl={rmExplorerUrl}
        />
      ) : (
        <DeployPrompt tokenDeployed={tokenDeployed} onOpenDeploy={onOpenDeploy} />
      )}
      <Textarea
        label="Description (optional)"
        placeholder="Describe the on-chain redemption process..."
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={3}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ManagerAddressDisplay                                                 */
/* ------------------------------------------------------------------ */

interface ManagerAddressDisplayProps {
  address: string;
  explorerUrl: string | null;
}

function ManagerAddressDisplay({ address, explorerUrl }: ManagerAddressDisplayProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide">
        RedemptionManager
      </label>
      <div className="rounded-lg border border-[#13636F]/20 bg-[#ECF3F4] px-3 py-2">
        <p className="font-mono text-xs text-zinc-700 break-all">{address}</p>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#13636F] hover:underline mt-1"
          >
            View on Basescan <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Holders can request redemptions on-chain. You receive notifications via
        the <strong>Redemptions</strong> tab when investors submit requests.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DeployPrompt                                                          */
/* ------------------------------------------------------------------ */

interface DeployPromptProps {
  tokenDeployed: boolean;
  onOpenDeploy: () => void;
}

function DeployPrompt({ tokenDeployed, onOpenDeploy }: DeployPromptProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 leading-relaxed">
        No RedemptionManager is deployed yet. Click below to deploy one via
        the <strong>CiretaRedemptionFactory</strong> — your wallet will sign a
        single transaction.
      </p>
      {!tokenDeployed && (
        <p className="text-xs text-amber-600">
          The token must be deployed on-chain before you can deploy a
          RedemptionManager.
        </p>
      )}
      <Button
        variant="primary"
        size="sm"
        onClick={onOpenDeploy}
        disabled={!tokenDeployed}
      >
        Deploy RedemptionManager
      </Button>
    </div>
  );
}
