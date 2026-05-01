"use client";

import { useState } from "react";
import { parseUnits, isAddress, type Abi } from "viem";
import { Lock, LockOpen, Layers, AlertTriangle } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { BatchAddressInput, useBatchRows } from "@/components/molecules/BatchAddressInput";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";

interface FreezeBatchPanelProps {
  contractAddr: `0x${string}`;
  decimals: number;
  symbol: string;
  hasFreezeRole: boolean | undefined;
  freezeRoleFetched: boolean;
}

const abi = CIRETA_TOKEN_ABI as unknown as Abi;

/**
 * Parses address-only lines (no amount column) for batchSetAddressFrozen.
 * Returns validated address rows.
 */
function useAddressOnlyRows(value: string): Array<{ address: string; valid: boolean }> {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const address = line.split(/[,\s]+/)[0] ?? "";
      return { address, valid: isAddress(address) };
    });
}

/** Batch panel for batchSetAddressFrozen (address-only, no amount). */
function BatchAddressFreezeToggle({
  contractAddr,
  hasFreezeRole,
  freezeRoleFetched,
}: Pick<FreezeBatchPanelProps, "contractAddr" | "hasFreezeRole" | "freezeRoleFetched">) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const freezeAction = useContractAction();
  const unfreezeAction = useContractAction();

  const rows = useAddressOnlyRows(input);
  const validRows = rows.filter((r) => r.valid);
  const invalidCount = rows.length - validRows.length;
  const roleDenied = freezeRoleFetched && hasFreezeRole === false;

  const handleBatch = async (freeze: boolean) => {
    setError(null);
    if (validRows.length === 0) { setError("Add at least one valid address."); return; }
    if (invalidCount > 0) { setError("Fix invalid rows before submitting."); return; }
    const addrs = validRows.map((r) => r.address as `0x${string}`);
    const freezeList = addrs.map(() => freeze);
    const action = freeze ? freezeAction : unfreezeAction;
    await action.execute({ address: contractAddr, abi, functionName: "batchSetAddressFrozen", args: [addrs, freezeList] });
    if (freeze ? freezeAction.isConfirmed : unfreezeAction.isConfirmed) setInput("");
  };

  const isPending =
    freezeAction.isPending || freezeAction.isConfirming ||
    unfreezeAction.isPending || unfreezeAction.isConfirming;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-700 flex items-center gap-2">
        <Lock className="h-4 w-4 text-darkAqua" /> Batch Address Freeze Toggle
      </p>
      <p className="text-xs text-black/40">One address per line. Submits a single transaction to freeze or unfreeze all listed addresses.</p>
      <BatchAddressInput
        value={input}
        onChange={setInput}
        withAmount={false}
        placeholder={"0xabc...\n0xdef...\n# comment lines ignored"}
        rows={5}
      />

      {roleDenied && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          FREEZE_ROLE required — transactions will revert.
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-black/40">{validRows.length} address{validRows.length !== 1 ? "es" : ""}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            onClick={() => handleBatch(true)}
            disabled={isPending || rows.length === 0}
            isLoading={freezeAction.isPending || freezeAction.isConfirming}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            Batch Freeze
          </Button>
          <Button variant="outline" size="sm"
            leftIcon={<LockOpen className="h-3.5 w-3.5" />}
            onClick={() => handleBatch(false)}
            disabled={isPending || rows.length === 0}
            isLoading={unfreezeAction.isPending || unfreezeAction.isConfirming}
          >
            Batch Unfreeze
          </Button>
        </div>
      </div>
      <TransactionStatus
        isPending={freezeAction.isPending} isConfirming={freezeAction.isConfirming}
        isConfirmed={freezeAction.isConfirmed} txHash={freezeAction.txHash}
        txUrl={freezeAction.txUrl} error={freezeAction.error}
        successMessage="Batch address freeze executed on-chain."
      />
      <TransactionStatus
        isPending={unfreezeAction.isPending} isConfirming={unfreezeAction.isConfirming}
        isConfirmed={unfreezeAction.isConfirmed} txHash={unfreezeAction.txHash}
        txUrl={unfreezeAction.txUrl} error={unfreezeAction.error}
        successMessage="Batch address unfreeze executed on-chain."
      />
    </div>
  );
}

/** Batch panel for batchFreezePartialTokens / batchUnfreezePartialTokens. */
function BatchPartialFreeze({
  contractAddr,
  decimals,
  symbol,
  hasFreezeRole,
  freezeRoleFetched,
}: FreezeBatchPanelProps) {
  const [freezeInput, setFreezeInput] = useState("");
  const [unfreezeInput, setUnfreezeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const freezeAction = useContractAction();
  const unfreezeAction = useContractAction();

  const freezeRows = useBatchRows(freezeInput, true);
  const unfreezeRows = useBatchRows(unfreezeInput, true);
  const roleDenied = freezeRoleFetched && hasFreezeRole === false;

  const handleBatch = async (mode: "freeze" | "unfreeze") => {
    setError(null);
    const rows = mode === "freeze" ? freezeRows : unfreezeRows;
    const valid = rows.filter((r) => r.addressValid && r.amountValid);
    if (valid.length === 0) { setError("Add at least one valid row."); return; }
    if (valid.length !== rows.length) { setError("Fix invalid rows before submitting."); return; }
    let addrs: `0x${string}`[];
    let amounts: bigint[];
    try {
      addrs = valid.map((r) => r.address as `0x${string}`);
      amounts = valid.map((r) => parseUnits(r.amountRaw, decimals));
    } catch {
      setError("Failed to parse amounts — check values.");
      return;
    }
    const action = mode === "freeze" ? freezeAction : unfreezeAction;
    const fn = mode === "freeze" ? "batchFreezePartialTokens" : "batchUnfreezePartialTokens";
    const receipt = await action.execute({ address: contractAddr, abi, functionName: fn, args: [addrs, amounts] });
    if (receipt) {
      if (mode === "freeze") setFreezeInput("");
      else setUnfreezeInput("");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-700 flex items-center gap-2">
        <Layers className="h-4 w-4 text-darkAqua" /> Batch Partial Freeze / Unfreeze
      </p>
      <p className="text-xs text-black/40">Format per line: <code className="font-mono">address,amount</code></p>

      {roleDenied && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          FREEZE_ROLE required — transactions will revert.
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1"><Lock className="h-3 w-3" /> Freeze ({symbol})</p>
          <BatchAddressInput value={freezeInput} onChange={setFreezeInput} withAmount rows={5} />
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm"
              leftIcon={<Lock className="h-3.5 w-3.5" />}
              onClick={() => handleBatch("freeze")}
              disabled={freezeAction.isPending || freezeAction.isConfirming || freezeRows.length === 0}
              isLoading={freezeAction.isPending || freezeAction.isConfirming}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              Batch Freeze Partial
            </Button>
          </div>
          <TransactionStatus
            isPending={freezeAction.isPending} isConfirming={freezeAction.isConfirming}
            isConfirmed={freezeAction.isConfirmed} txHash={freezeAction.txHash}
            txUrl={freezeAction.txUrl} error={freezeAction.error}
            successMessage="Batch partial freeze executed."
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1"><LockOpen className="h-3 w-3" /> Unfreeze ({symbol})</p>
          <BatchAddressInput value={unfreezeInput} onChange={setUnfreezeInput} withAmount rows={5} />
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm"
              leftIcon={<LockOpen className="h-3.5 w-3.5" />}
              onClick={() => handleBatch("unfreeze")}
              disabled={unfreezeAction.isPending || unfreezeAction.isConfirming || unfreezeRows.length === 0}
              isLoading={unfreezeAction.isPending || unfreezeAction.isConfirming}
            >
              Batch Unfreeze Partial
            </Button>
          </div>
          <TransactionStatus
            isPending={unfreezeAction.isPending} isConfirming={unfreezeAction.isConfirming}
            isConfirmed={unfreezeAction.isConfirmed} txHash={unfreezeAction.txHash}
            txUrl={unfreezeAction.txUrl} error={unfreezeAction.error}
            successMessage="Batch partial unfreeze executed."
          />
        </div>
      </div>
    </div>
  );
}

/** Composed batch freeze panel — exports single entry point for the page. */
export function FreezeBatchPanel(props: FreezeBatchPanelProps) {
  return (
    <div className="space-y-8">
      <BatchAddressFreezeToggle
        contractAddr={props.contractAddr}
        hasFreezeRole={props.hasFreezeRole}
        freezeRoleFetched={props.freezeRoleFetched}
      />
      <div className="border-t border-black/10 pt-6">
        <BatchPartialFreeze {...props} />
      </div>
    </div>
  );
}
