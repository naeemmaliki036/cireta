"use client";

/**
 * Config panels for the four numeric/time compliance modules:
 *   MaxBalanceModule, MaxOwnershipModule,
 *   TimeLockedTransferModule, TimeTransfersLimitModule.
 *
 * Each panel: reads current on-chain value, displays it, and provides a
 * write action via useContractAction.
 */

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi, parseUnits, formatUnits } from "viem";
import { Button, Input } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { MAX_BALANCE_MODULE_ABI } from "@/lib/contracts/abis/maxBalanceModule";
import { MAX_OWNERSHIP_MODULE_ABI } from "@/lib/contracts/abis/maxOwnershipModule";
import { TIME_LOCKED_TRANSFER_MODULE_ABI } from "@/lib/contracts/abis/timeLockedTransferModule";
import { TIME_TRANSFERS_LIMIT_MODULE_ABI } from "@/lib/contracts/abis/timeTransfersLimitModule";
import type { ComplianceModule } from "@/lib/api/repositories/token-compliance";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatUnixTs(ts: bigint): string {
  if (ts === 0n) return "Not set";
  return new Date(Number(ts) * 1000).toLocaleString();
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Unlock-time badge
// ---------------------------------------------------------------------------

function UnlockTimeBadge({ unlockTs }: { unlockTs: bigint }): React.ReactElement | null {
  if (unlockTs === 0n) return null;
  const isPast = Date.now() >= Number(unlockTs) * 1000;
  const label = formatUnixTs(unlockTs);
  if (isPast) {
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700">
        Unlocked since {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700">
      Locked until {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Module A — MaxBalanceConfig
// ---------------------------------------------------------------------------

export function MaxBalanceConfig({
  module, complianceAddress, tokenDecimals, onRefresh,
}: { module: ComplianceModule; complianceAddress: string; tokenDecimals: number; onRefresh: () => void }): React.ReactElement {
  const [input, setInput] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const setAction = useContractAction();

  const { data: rawMax, refetch } = useReadContract({
    address: module.address as `0x${string}`,
    abi: MAX_BALANCE_MODULE_ABI as unknown as Abi,
    functionName: "getMaxBalance",
    args: [complianceAddress as `0x${string}`],
    query: { enabled: !!module.address && !!complianceAddress },
  });
  const currentMax = rawMax as bigint | undefined;

  const handleSet = useCallback(async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    const trimmed = input.trim();
    if (trimmed === "") return;
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0) return;
    if (parsed === 0 && !window.confirm("Setting max balance to 0 means unlimited. Proceed?")) return;
    const receipt = await setAction.execute({
      address: module.address as `0x${string}`,
      abi: MAX_BALANCE_MODULE_ABI as unknown as Abi,
      functionName: "setMaxBalance",
      args: [complianceAddress as `0x${string}`, parseUnits(trimmed, tokenDecimals)],
    });
    if (receipt) { setInput(""); void refetch(); onRefresh(); }
  }, [isConnected, openConnectModal, input, module.address, complianceAddress, tokenDecimals, setAction, refetch, onRefresh]);

  const displayMax =
    currentMax === undefined ? "Loading…" :
    currentMax === 0n ? "0 (unlimited)" :
    `${formatUnits(currentMax, tokenDecimals)} tokens`;

  return (
    <div className="space-y-3">
      {(setAction.isPending || setAction.isConfirming || setAction.error) && (
        <TransactionStatus isPending={setAction.isPending} isConfirming={setAction.isConfirming}
          isConfirmed={setAction.isConfirmed} txHash={setAction.txHash} txUrl={setAction.txUrl}
          error={setAction.error} successMessage="Max balance updated." />
      )}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">Current max balance:</span>
        <span className="font-semibold text-zinc-900">{displayMax}</span>
      </div>
      <p className="text-[11px] text-zinc-400 bg-zinc-50 rounded-lg px-2.5 py-1.5">
        Caps the total tokens any single address may hold. <strong>0</strong> disables the cap (unlimited).
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Max balance (whole tokens)</label>
          <Input type="number" min={0} step="any" value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="e.g. 10000" />
        </div>
        <Button variant="primary" size="sm" onClick={handleSet}
          disabled={setAction.isPending || setAction.isConfirming || input.trim() === ""}
          isLoading={setAction.isPending || setAction.isConfirming}>
          Set Max Balance
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module B — MaxOwnershipConfig
// ---------------------------------------------------------------------------

export function MaxOwnershipConfig({
  module, complianceAddress, tokenDecimals, onRefresh,
}: { module: ComplianceModule; complianceAddress: string; tokenDecimals: number; onRefresh: () => void }): React.ReactElement {
  const [input, setInput] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const setAction = useContractAction();

  const { data: rawMax, refetch } = useReadContract({
    address: module.address as `0x${string}`,
    abi: MAX_OWNERSHIP_MODULE_ABI as unknown as Abi,
    functionName: "getMaxBalance",
    args: [complianceAddress as `0x${string}`],
    query: { enabled: !!module.address && !!complianceAddress },
  });
  const currentMax = rawMax as bigint | undefined;

  const handleSet = useCallback(async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    const trimmed = input.trim();
    if (trimmed === "") return;
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed < 0) return;
    if (parsed === 0 && !window.confirm("Setting ownership cap to 0 means unlimited. Proceed?")) return;
    const receipt = await setAction.execute({
      address: module.address as `0x${string}`,
      abi: MAX_OWNERSHIP_MODULE_ABI as unknown as Abi,
      functionName: "setMaxBalance",
      args: [complianceAddress as `0x${string}`, parseUnits(trimmed, tokenDecimals)],
    });
    if (receipt) { setInput(""); void refetch(); onRefresh(); }
  }, [isConnected, openConnectModal, input, module.address, complianceAddress, tokenDecimals, setAction, refetch, onRefresh]);

  const displayMax =
    currentMax === undefined ? "Loading…" :
    currentMax === 0n ? "0 (unlimited)" :
    `${formatUnits(currentMax, tokenDecimals)} tokens`;

  return (
    <div className="space-y-3">
      {(setAction.isPending || setAction.isConfirming || setAction.error) && (
        <TransactionStatus isPending={setAction.isPending} isConfirming={setAction.isConfirming}
          isConfirmed={setAction.isConfirmed} txHash={setAction.txHash} txUrl={setAction.txUrl}
          error={setAction.error} successMessage="Ownership cap updated." />
      )}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">Current ownership cap:</span>
        <span className="font-semibold text-zinc-900">{displayMax}</span>
      </div>
      <p className="text-[11px] text-zinc-400 bg-zinc-50 rounded-lg px-2.5 py-1.5">
        Enforces a hard token-amount ceiling per address (not a percentage of supply).
        <strong> 0</strong> disables the cap.
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Ownership cap (whole tokens)</label>
          <Input type="number" min={0} step="any" value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="e.g. 50000" />
        </div>
        <Button variant="primary" size="sm" onClick={handleSet}
          disabled={setAction.isPending || setAction.isConfirming || input.trim() === ""}
          isLoading={setAction.isPending || setAction.isConfirming}>
          Set Ownership Cap
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modules C & D — shared TimeModuleConfig (identical on-chain interface)
// ---------------------------------------------------------------------------

interface TimeModuleConfigProps {
  module: ComplianceModule;
  complianceAddress: string;
  abiFragment: Abi;
  successMessage: string;
  onRefresh: () => void;
}

export function TimeModuleConfig({
  module, complianceAddress, abiFragment, successMessage, onRefresh,
}: TimeModuleConfigProps): React.ReactElement {
  const [datetimeLocal, setDatetimeLocal] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const setAction = useContractAction();

  const { data: rawTs, refetch } = useReadContract({
    address: module.address as `0x${string}`,
    abi: abiFragment,
    functionName: "getUnlockTime",
    args: [complianceAddress as `0x${string}`],
    query: { enabled: !!module.address && !!complianceAddress },
  });
  const unlockTs = rawTs as bigint | undefined;

  // Pre-fill input when chain value first arrives (only if not yet edited by user)
  useEffect(() => {
    if (unlockTs !== undefined && unlockTs > 0n && datetimeLocal === "") {
      setDatetimeLocal(toDatetimeLocal(new Date(Number(unlockTs) * 1000)));
    }
  // datetimeLocal intentionally excluded — only run when chain data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockTs]);

  const handleSet = useCallback(async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    setValidationError(null);
    if (!datetimeLocal) { setValidationError("Select a date and time."); return; }
    const unixSec = Math.floor(new Date(datetimeLocal).getTime() / 1000);
    if (unixSec <= Math.floor(Date.now() / 1000)) {
      setValidationError("Unlock time must be in the future.");
      return;
    }
    const receipt = await setAction.execute({
      address: module.address as `0x${string}`,
      abi: abiFragment,
      functionName: "setUnlockTime",
      args: [complianceAddress as `0x${string}`, BigInt(unixSec)],
    });
    if (receipt) { void refetch(); onRefresh(); }
  }, [isConnected, openConnectModal, datetimeLocal, module.address, complianceAddress, abiFragment, setAction, refetch, onRefresh]);

  return (
    <div className="space-y-3">
      {(setAction.isPending || setAction.isConfirming || setAction.error) && (
        <TransactionStatus isPending={setAction.isPending} isConfirming={setAction.isConfirming}
          isConfirmed={setAction.isConfirmed} txHash={setAction.txHash} txUrl={setAction.txUrl}
          error={setAction.error} successMessage={successMessage} />
      )}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-zinc-500">Current unlock time:</span>
        {unlockTs === undefined
          ? <span className="text-zinc-400 text-xs">Loading…</span>
          : unlockTs === 0n
          ? <span className="font-semibold text-zinc-900">Not set (no lock)</span>
          : <UnlockTimeBadge unlockTs={unlockTs} />
        }
      </div>
      <p className="text-[11px] text-zinc-400 bg-zinc-50 rounded-lg px-2.5 py-1.5">
        Transfers are blocked until this time. The on-chain contract rejects past timestamps —
        leave unchanged if no lock is needed.
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Unlock date &amp; time (local)</label>
          <input
            type="datetime-local"
            value={datetimeLocal}
            onChange={(e) => { setDatetimeLocal(e.target.value); setValidationError(null); }}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          />
        </div>
        <Button variant="primary" size="sm" onClick={handleSet}
          disabled={setAction.isPending || setAction.isConfirming || !datetimeLocal}
          isLoading={setAction.isPending || setAction.isConfirming}>
          Set Unlock Time
        </Button>
      </div>
      {validationError && <p className="text-xs text-red-600">{validationError}</p>}
    </div>
  );
}

// Re-export the two time ABIs so ComplianceModuleCards can import from one place
export { TIME_LOCKED_TRANSFER_MODULE_ABI, TIME_TRANSFERS_LIMIT_MODULE_ABI };
