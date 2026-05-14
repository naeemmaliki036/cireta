"use client";

import { X, Rocket, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import type { ContractActionState } from "@/hooks/useContractAction";

interface DeployRedemptionModalProps {
  /** The RM address that was just deployed — drives success vs. pre-deploy view */
  deployedAddress: `0x${string}` | null;
  action: ContractActionState;
  onDeploy: () => Promise<void>;
  onClose: () => void;
}

/**
 * Modal shown when the issuer clicks "Deploy RedemptionManager".
 * Pre-deploy: shows a confirm CTA + live transaction progress.
 * Post-deploy: shows the deployed address + follow-up checklist reminder.
 */
export function DeployRedemptionModal({
  deployedAddress,
  action,
  onDeploy,
  onClose,
}: DeployRedemptionModalProps) {
  const isBusy = action.isPending || action.isConfirming;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={isBusy ? undefined : onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-[#13636F]" />
            <h2 className="text-base font-semibold text-zinc-900">
              Deploy RedemptionManager
            </h2>
          </div>
          {!isBusy && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {deployedAddress ? (
            <PostDeployView address={deployedAddress} />
          ) : (
            <PreDeployView action={action} onDeploy={onDeploy} isBusy={isBusy} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#ECF3F4] border-t border-zinc-100 flex items-center justify-end gap-3">
          {deployedAddress ? (
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onDeploy}
                disabled={isBusy}
                isLoading={isBusy}
              >
                Deploy On-Chain
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-views                                                             */
/* ------------------------------------------------------------------ */

interface PreDeployViewProps {
  action: ContractActionState;
  onDeploy: () => Promise<void>;
  isBusy: boolean;
}

function PreDeployView({ action, isBusy: _isBusy }: PreDeployViewProps) {
  return (
    <>
      <div className="rounded-lg bg-[#ECF3F4] px-4 py-3 text-sm text-zinc-700 leading-relaxed">
        Clicking <strong>Deploy On-Chain</strong> will call{" "}
        <code className="text-xs bg-white rounded px-1 py-0.5 border border-zinc-200">
          deployRedemptionManager(tokenAddress)
        </code>{" "}
        on the <strong>CiretaRedemptionFactory</strong>. Your wallet will be
        prompted to sign the transaction. The factory will deploy a new
        RedemptionManager proxy linked to your token.
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          This is irreversible. Each token can have at most one
          RedemptionManager. You will still need to whitelist the deployed
          contract and grant it SUPPLY_ROLE — reminders will appear after
          deployment.
        </span>
      </div>

      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="RedemptionManager deployed on-chain."
      />
    </>
  );
}

interface PostDeployViewProps {
  address: `0x${string}`;
}

function PostDeployView({ address }: PostDeployViewProps) {
  const basescanUrl = `https://sepolia.basescan.org/address/${address}`;

  return (
    <>
      {/* Success banner */}
      <div className="flex items-start gap-3 rounded-lg border border-[#13636F]/30 bg-[#13636F]/5 px-4 py-3">
        <Rocket className="h-5 w-5 text-[#13636F] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 mb-1">
            RedemptionManager deployed
          </p>
          <p className="font-mono text-xs text-zinc-500 break-all">{address}</p>
          <a
            href={basescanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#13636F] hover:underline mt-1"
          >
            View on Basescan <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Follow-up checklist */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
        <p className="text-sm font-semibold text-amber-800 mb-2">
          Two follow-up steps required before holders can redeem:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-amber-700">
          <li>
            <strong>Whitelist this contract</strong> on your token&apos;s identity
            registry — so the RM can interact with compliant wallets.
          </li>
          <li>
            <strong>Grant SUPPLY_ROLE</strong> on your token to the RM address —
            so it can burn tokens when a redemption is fulfilled.
          </li>
        </ol>
        <p className="text-xs text-amber-600 mt-3">
          Both can be done from <strong>Token Settings &rarr; On-chain controls</strong>.
        </p>
      </div>
    </>
  );
}
