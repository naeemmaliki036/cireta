"use client";

import { useState } from "react";
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { useReadContract } from "wagmi";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { Button } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";

interface FreezeAddressPanelProps {
  contractAddr: `0x${string}`;
  decimals: number;
  symbol: string;
  hasFreezeRole: boolean | undefined;
  freezeRoleFetched: boolean;
}

const abi = CIRETA_TOKEN_ABI as unknown as Abi;

/** Shared address input used in both freeze-toggle and partial-freeze sections. */
function AddressField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const invalid = value !== "" && !isAddress(value);
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={42}
        placeholder="0x..."
        className={`w-full px-4 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
          invalid ? "border-red-300 bg-red-50/30" : "border-zinc-200"
        }`}
      />
      {invalid && (
        <p className="text-xs text-red-500 mt-1">Invalid EVM address — must be 42 chars starting with 0x</p>
      )}
    </div>
  );
}

/** Section 1: toggle a full address freeze on/off. */
export function AddressFreezeToggle({
  contractAddr,
  hasFreezeRole,
  freezeRoleFetched,
}: Pick<FreezeAddressPanelProps, "contractAddr" | "hasFreezeRole" | "freezeRoleFetched">) {
  const [addr, setAddr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useContractAction();

  const addrValid = addr !== "" && isAddress(addr);

  const { data: isFrozenRaw, refetch: refetchFrozen } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "isFrozen",
    args: addrValid ? [addr as `0x${string}`] : undefined,
    query: { enabled: addrValid },
  });
  const isFrozen = isFrozenRaw === true;

  const handleToggle = async (freeze: boolean) => {
    setError(null);
    if (!addrValid) { setError("Enter a valid wallet address."); return; }
    const receipt = await action.execute({
      address: contractAddr,
      abi,
      functionName: "setAddressFrozen",
      args: [addr as `0x${string}`, freeze],
    });
    if (receipt) {
      await refetchFrozen();
    }
  };

  const roleDenied = freezeRoleFetched && hasFreezeRole === false;

  return (
    <div className="space-y-4 max-w-lg">
      <AddressField value={addr} onChange={(v) => { setAddr(v); setError(null); action.reset(); }} label="Wallet Address" />

      {addrValid && (
        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-black/10 bg-zinc-50">
          {isFrozen ? (
            <><Lock className="h-4 w-4 text-red-500" /><span className="text-red-600 font-medium">Frozen</span></>
          ) : (
            <><LockOpen className="h-4 w-4 text-green-500" /><span className="text-green-600 font-medium">Not frozen</span></>
          )}
          <CopyableAddress address={addr} truncate className="ml-auto text-xs text-zinc-400" />
        </div>
      )}

      {roleDenied && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Your connected wallet does not have FREEZE_ROLE on this token. Transactions will revert.
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Lock className="h-4 w-4" />}
          onClick={() => handleToggle(true)}
          disabled={action.isPending || action.isConfirming || !addrValid || isFrozen}
          isLoading={action.isPending || action.isConfirming}
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          Freeze Address
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<LockOpen className="h-4 w-4" />}
          onClick={() => handleToggle(false)}
          disabled={action.isPending || action.isConfirming || !addrValid || !isFrozen}
          isLoading={action.isPending || action.isConfirming}
        >
          Unfreeze Address
        </Button>
      </div>

      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="Address freeze state updated on-chain."
      />
    </div>
  );
}

/** Section 2: freeze or unfreeze a partial token amount for an address. */
export function PartialFreezePanel({
  contractAddr,
  decimals,
  symbol,
  hasFreezeRole,
  freezeRoleFetched,
}: FreezeAddressPanelProps) {
  const [addr, setAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const freezeAction = useContractAction();
  const unfreezeAction = useContractAction();

  const addrValid = addr !== "" && isAddress(addr);

  const { data: frozenAmountRaw, refetch: refetchFrozen } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "getFrozenTokens",
    args: addrValid ? [addr as `0x${string}`] : undefined,
    query: { enabled: addrValid },
  });

  const { data: balanceRaw } = useReadContract({
    address: contractAddr,
    abi,
    functionName: "balanceOf",
    args: addrValid ? [addr as `0x${string}`] : undefined,
    query: { enabled: addrValid },
  });

  const frozenFormatted = frozenAmountRaw != null
    ? parseFloat(formatUnits(frozenAmountRaw as bigint, decimals)).toLocaleString()
    : null;
  const balanceFormatted = balanceRaw != null
    ? parseFloat(formatUnits(balanceRaw as bigint, decimals)).toLocaleString()
    : null;

  const parseAmount = (): bigint | null => {
    const cleaned = amount.replace(/[,\s]/g, "");
    if (!cleaned || isNaN(Number(cleaned)) || Number(cleaned) <= 0) return null;
    const parts = cleaned.split(".");
    if (parts.length === 2 && (parts[1]?.length ?? 0) > decimals) return null;
    try { return parseUnits(cleaned, decimals); } catch { return null; }
  };

  const handlePartial = async (mode: "freeze" | "unfreeze") => {
    setError(null);
    if (!addrValid) { setError("Enter a valid wallet address."); return; }
    const parsed = parseAmount();
    if (!parsed || parsed <= 0n) { setError(`Enter a valid positive amount (max ${decimals} decimals).`); return; }
    const action = mode === "freeze" ? freezeAction : unfreezeAction;
    const fnName = mode === "freeze" ? "freezePartialTokens" : "unfreezePartialTokens";
    const receipt = await action.execute({ address: contractAddr, abi, functionName: fnName, args: [addr as `0x${string}`, parsed] });
    if (receipt) { setAmount(""); await refetchFrozen(); }
  };

  const roleDenied = freezeRoleFetched && hasFreezeRole === false;
  const isPending = freezeAction.isPending || freezeAction.isConfirming || unfreezeAction.isPending || unfreezeAction.isConfirming;

  return (
    <div className="space-y-4 max-w-lg">
      <AddressField value={addr} onChange={(v) => { setAddr(v); setError(null); freezeAction.reset(); unfreezeAction.reset(); }} label="Wallet Address" />

      {addrValid && (frozenFormatted !== null || balanceFormatted !== null) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-zinc-50 rounded-lg px-3 py-2 border border-black/10">
            <p className="text-xs text-black/40 mb-0.5">Total Balance</p>
            <p className="font-semibold text-text">{balanceFormatted ?? "—"} <span className="text-xs font-normal text-black/40">{symbol}</span></p>
          </div>
          <div className="bg-zinc-50 rounded-lg px-3 py-2 border border-black/10">
            <p className="text-xs text-black/40 mb-0.5">Frozen Amount</p>
            <p className="font-semibold text-red-600">{frozenFormatted ?? "—"} <span className="text-xs font-normal text-black/40">{symbol}</span></p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Amount ({symbol})</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setError(null); }}
          className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          placeholder="1000"
        />
        {amount && Number(amount) > 0 && (
          <p className="text-sm font-medium text-darkAqua mt-1">{Number(amount).toLocaleString()} {symbol}</p>
        )}
      </div>

      {roleDenied && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Your connected wallet does not have FREEZE_ROLE on this token.
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Lock className="h-4 w-4" />}
          onClick={() => handlePartial("freeze")}
          disabled={isPending || !addrValid}
          isLoading={freezeAction.isPending || freezeAction.isConfirming}
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          Freeze Partial
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<LockOpen className="h-4 w-4" />}
          onClick={() => handlePartial("unfreeze")}
          disabled={isPending || !addrValid}
          isLoading={unfreezeAction.isPending || unfreezeAction.isConfirming}
        >
          Unfreeze Partial
        </Button>
      </div>

      <TransactionStatus
        isPending={freezeAction.isPending}
        isConfirming={freezeAction.isConfirming}
        isConfirmed={freezeAction.isConfirmed}
        txHash={freezeAction.txHash}
        txUrl={freezeAction.txUrl}
        error={freezeAction.error}
        successMessage="Partial freeze executed on-chain."
      />
      <TransactionStatus
        isPending={unfreezeAction.isPending}
        isConfirming={unfreezeAction.isConfirming}
        isConfirmed={unfreezeAction.isConfirmed}
        txHash={unfreezeAction.txHash}
        txUrl={unfreezeAction.txUrl}
        error={unfreezeAction.error}
        successMessage="Partial unfreeze executed on-chain."
      />
    </div>
  );
}
