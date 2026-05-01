"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useReadContract, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/atoms/Button";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { LOCK_MODULE_ABI } from "@/lib/contracts/abis/lockModule";
import { StatusBadge, AddressField, type ModuleConfigProps } from "./AddressModuleShared";

export function LockConfig({ module, complianceAddress, onRefresh }: ModuleConfigProps) {
  const [account, setAccount] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const lockAction = useContractAction();
  const unlockAction = useContractAction();

  const validAccount = isAddress(account);

  const { data: isLocked, refetch: refetchStatus } = useReadContract({
    address: module.address as `0x${string}`,
    abi: LOCK_MODULE_ABI as unknown as Abi,
    functionName: "isLocked",
    args: validAccount
      ? [complianceAddress as `0x${string}`, account as `0x${string}`]
      : undefined,
    query: { enabled: validAccount },
  });

  const run = async (action: ReturnType<typeof useContractAction>, fn: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    const receipt = await action.execute({
      address: module.address as `0x${string}`,
      abi: LOCK_MODULE_ABI as unknown as Abi,
      functionName: fn,
      args: [complianceAddress as `0x${string}`, account as `0x${string}`],
    });
    if (receipt) { void refetchStatus(); onRefresh(); }
  };

  const busy = lockAction.isPending || lockAction.isConfirming
    || unlockAction.isPending || unlockAction.isConfirming;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <AddressField label="Address" value={account} onChange={setAccount} />
        </div>
        <StatusBadge
          status={validAccount ? (isLocked as boolean | undefined) : undefined}
          activeLabel="Locked"
          inactiveLabel="Unlocked"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!validAccount || busy}
          isLoading={lockAction.isPending || lockAction.isConfirming}
          onClick={() => run(lockAction, "lockAddress")}>
          Lock
        </Button>
        <Button variant="outline" size="sm" disabled={!validAccount || busy}
          isLoading={unlockAction.isPending || unlockAction.isConfirming}
          onClick={() => run(unlockAction, "unlockAddress")}>
          Unlock
        </Button>
      </div>
      {(lockAction.isPending || lockAction.isConfirming || lockAction.isConfirmed || lockAction.error) && (
        <TransactionStatus isPending={lockAction.isPending} isConfirming={lockAction.isConfirming}
          isConfirmed={lockAction.isConfirmed} txHash={lockAction.txHash} txUrl={lockAction.txUrl}
          error={lockAction.error} successMessage="Address locked." />
      )}
      {(unlockAction.isPending || unlockAction.isConfirming || unlockAction.isConfirmed || unlockAction.error) && (
        <TransactionStatus isPending={unlockAction.isPending} isConfirming={unlockAction.isConfirming}
          isConfirmed={unlockAction.isConfirmed} txHash={unlockAction.txHash} txUrl={unlockAction.txUrl}
          error={unlockAction.error} successMessage="Address unlocked." />
      )}
    </div>
  );
}
