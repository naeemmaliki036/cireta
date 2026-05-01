"use client";

/**
 * Config panels for TransferRestrictModule and ConditionalTransferModule.
 * Both modules share the same ABI shape (approveAddress / revokeAddress / isApproved)
 * so they use the same panel component parameterised by ABI.
 */

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useReadContract, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/atoms/Button";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { TRANSFER_RESTRICT_MODULE_ABI } from "@/lib/contracts/abis/transferRestrictModule";
import { CONDITIONAL_TRANSFER_MODULE_ABI } from "@/lib/contracts/abis/conditionalTransferModule";
import { StatusBadge, AddressField, type ModuleConfigProps } from "./AddressModuleShared";

interface ApprovalPanelProps extends ModuleConfigProps {
  abi: Abi;
  hint: string;
}

function ApprovalPanel({ module, complianceAddress, onRefresh, abi, hint }: ApprovalPanelProps) {
  const [account, setAccount] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const approveAction = useContractAction();
  const revokeAction = useContractAction();

  const validAccount = isAddress(account);

  const { data: approved, refetch: refetchStatus } = useReadContract({
    address: module.address as `0x${string}`,
    abi,
    functionName: "isApproved",
    args: validAccount
      ? [complianceAddress as `0x${string}`, account as `0x${string}`]
      : undefined,
    query: { enabled: validAccount },
  });

  const run = async (action: ReturnType<typeof useContractAction>, fn: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    const receipt = await action.execute({
      address: module.address as `0x${string}`,
      abi,
      functionName: fn,
      args: [complianceAddress as `0x${string}`, account as `0x${string}`],
    });
    if (receipt) { void refetchStatus(); onRefresh(); }
  };

  const busy = approveAction.isPending || approveAction.isConfirming
    || revokeAction.isPending || revokeAction.isConfirming;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">{hint}</p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <AddressField label="Address" value={account} onChange={setAccount} />
        </div>
        <StatusBadge
          status={validAccount ? (approved as boolean | undefined) : undefined}
          activeLabel="Approved"
          inactiveLabel="Not approved"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!validAccount || busy}
          isLoading={approveAction.isPending || approveAction.isConfirming}
          onClick={() => run(approveAction, "approveAddress")}>
          Approve
        </Button>
        <Button variant="outline" size="sm" disabled={!validAccount || busy}
          isLoading={revokeAction.isPending || revokeAction.isConfirming}
          onClick={() => run(revokeAction, "revokeAddress")}>
          Revoke
        </Button>
      </div>
      {(approveAction.isPending || approveAction.isConfirming || approveAction.isConfirmed || approveAction.error) && (
        <TransactionStatus isPending={approveAction.isPending} isConfirming={approveAction.isConfirming}
          isConfirmed={approveAction.isConfirmed} txHash={approveAction.txHash} txUrl={approveAction.txUrl}
          error={approveAction.error} successMessage="Address approved." />
      )}
      {(revokeAction.isPending || revokeAction.isConfirming || revokeAction.isConfirmed || revokeAction.error) && (
        <TransactionStatus isPending={revokeAction.isPending} isConfirming={revokeAction.isConfirming}
          isConfirmed={revokeAction.isConfirmed} txHash={revokeAction.txHash} txUrl={revokeAction.txUrl}
          error={revokeAction.error} successMessage="Address revoked." />
      )}
    </div>
  );
}

export function TransferRestrictConfig(props: ModuleConfigProps) {
  return (
    <ApprovalPanel
      {...props}
      abi={TRANSFER_RESTRICT_MODULE_ABI as unknown as Abi}
      hint="Approve an address to participate in transfers as a sender or receiver. Both the sender and receiver must be approved for a transfer to succeed."
    />
  );
}

export function ConditionalTransferConfig(props: ModuleConfigProps) {
  return (
    <ApprovalPanel
      {...props}
      abi={CONDITIONAL_TRANSFER_MODULE_ABI as unknown as Abi}
      hint="Pre-approve an address to send or receive tokens. Transfers involving non-approved addresses are blocked on-chain."
    />
  );
}
