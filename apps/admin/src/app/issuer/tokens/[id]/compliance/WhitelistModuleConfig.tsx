"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useReadContract, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/atoms/Button";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { BatchAddressInput, useBatchRows } from "@/components/molecules/BatchAddressInput";
import { WHITELIST_MODULE_ABI } from "@/lib/contracts/abis/whitelistModule";
import { StatusBadge, AddressField, type ModuleConfigProps } from "./AddressModuleShared";

export function WhitelistConfig({ module, complianceAddress, onRefresh }: ModuleConfigProps) {
  const [account, setAccount] = useState("");
  const [batchText, setBatchText] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const addAction = useContractAction();
  const removeAction = useContractAction();
  const batchAction = useContractAction();

  const validAccount = isAddress(account);
  const batchRows = useBatchRows(batchText, false);
  const validBatchAddrs = batchRows.filter((r) => r.addressValid).map((r) => r.address);

  const { data: whitelisted, refetch: refetchStatus } = useReadContract({
    address: module.address as `0x${string}`,
    abi: WHITELIST_MODULE_ABI as unknown as Abi,
    functionName: "isWhitelisted",
    args: validAccount
      ? [complianceAddress as `0x${string}`, account as `0x${string}`]
      : undefined,
    query: { enabled: validAccount },
  });

  const runSingle = async (action: ReturnType<typeof useContractAction>, fn: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    const receipt = await action.execute({
      address: module.address as `0x${string}`,
      abi: WHITELIST_MODULE_ABI as unknown as Abi,
      functionName: fn,
      args: [complianceAddress as `0x${string}`, account as `0x${string}`],
    });
    if (receipt) { void refetchStatus(); onRefresh(); }
  };

  const runBatch = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    const receipt = await batchAction.execute({
      address: module.address as `0x${string}`,
      abi: WHITELIST_MODULE_ABI as unknown as Abi,
      functionName: "batchWhitelist",
      args: [complianceAddress as `0x${string}`, validBatchAddrs as `0x${string}`[]],
    });
    if (receipt) { setBatchText(""); onRefresh(); }
  };

  const busy = addAction.isPending || addAction.isConfirming
    || removeAction.isPending || removeAction.isConfirming
    || batchAction.isPending || batchAction.isConfirming;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <AddressField label="Address" value={account} onChange={setAccount} />
        </div>
        <StatusBadge
          status={validAccount ? (whitelisted as boolean | undefined) : undefined}
          activeLabel="Whitelisted"
          inactiveLabel="Not listed"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!validAccount || busy}
          isLoading={addAction.isPending || addAction.isConfirming}
          onClick={() => runSingle(addAction, "whitelistAddress")}>
          Whitelist
        </Button>
        <Button variant="outline" size="sm" disabled={!validAccount || busy}
          isLoading={removeAction.isPending || removeAction.isConfirming}
          onClick={() => runSingle(removeAction, "dewhitelistAddress")}>
          Remove
        </Button>
      </div>
      {(addAction.isPending || addAction.isConfirming || addAction.isConfirmed || addAction.error) && (
        <TransactionStatus isPending={addAction.isPending} isConfirming={addAction.isConfirming}
          isConfirmed={addAction.isConfirmed} txHash={addAction.txHash} txUrl={addAction.txUrl}
          error={addAction.error} successMessage="Address whitelisted." />
      )}
      {(removeAction.isPending || removeAction.isConfirming || removeAction.isConfirmed || removeAction.error) && (
        <TransactionStatus isPending={removeAction.isPending} isConfirming={removeAction.isConfirming}
          isConfirmed={removeAction.isConfirmed} txHash={removeAction.txHash} txUrl={removeAction.txUrl}
          error={removeAction.error} successMessage="Address removed from whitelist." />
      )}
      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs font-semibold text-zinc-500 mb-2">Batch Whitelist</p>
        <BatchAddressInput value={batchText} onChange={setBatchText}
          placeholder={"0xabc...\n0xdef...\n# comment lines ignored"} rows={5} />
        <Button variant="primary" size="sm" className="mt-3"
          disabled={validBatchAddrs.length === 0 || busy}
          isLoading={batchAction.isPending || batchAction.isConfirming}
          onClick={runBatch}>
          Batch Whitelist ({validBatchAddrs.length})
        </Button>
        {(batchAction.isPending || batchAction.isConfirming || batchAction.isConfirmed || batchAction.error) && (
          <TransactionStatus isPending={batchAction.isPending} isConfirming={batchAction.isConfirming}
            isConfirmed={batchAction.isConfirmed} txHash={batchAction.txHash} txUrl={batchAction.txUrl}
            error={batchAction.error} successMessage="Batch whitelist applied." />
        )}
      </div>
    </div>
  );
}
