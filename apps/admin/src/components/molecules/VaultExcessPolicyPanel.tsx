"use client";

import { type Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_VAULT_ABI, EXCESS_POLICY_LABELS } from "@/lib/contracts/abis/ciretaVault";

interface VaultExcessPolicyPanelProps {
  vaultAddress: `0x${string}`;
}

/**
 * Molecule: inline panel to read + set CiretaVault.excessPolicy.
 * ExcessPolicy: 0 = Keep, 1 = BurnToMatch
 * Requires onlyOwner — the vault owner is typically the issuer wallet.
 */
export function VaultExcessPolicyPanel({ vaultAddress }: VaultExcessPolicyPanelProps) {
  const { address: wallet, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();

  const { data: currentPolicy, refetch } = useReadContract({
    address: vaultAddress,
    abi: CIRETA_VAULT_ABI as unknown as Abi,
    functionName: "excessPolicy",
    query: { enabled: !!vaultAddress },
  });

  const { data: ownerData } = useReadContract({
    address: vaultAddress,
    abi: CIRETA_VAULT_ABI as unknown as Abi,
    functionName: "owner",
    query: { enabled: !!vaultAddress && !!wallet },
  });

  const isOwner =
    ownerData && wallet
      ? (ownerData as string).toLowerCase() === wallet.toLowerCase()
      : undefined;

  const policyNum = typeof currentPolicy === "number" ? currentPolicy : typeof currentPolicy === "bigint" ? Number(currentPolicy) : undefined;

  const handleSet = async (policy: 0 | 1) => {
    if (!isConnected) { openConnectModal?.(); return; }
    action.reset();
    const receipt = await action.execute({
      address: vaultAddress,
      abi: CIRETA_VAULT_ABI as unknown as Abi,
      functionName: "setExcessPolicy",
      args: [policy],
    });
    if (receipt) refetch();
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-1">Vault Excess Policy</h3>
      <p className="text-xs text-zinc-400 mb-3">
        Controls what happens to excess project tokens in the vault after all fractions are claimed.
        Vault: <code className="font-mono">{vaultAddress}</code>
      </p>

      {isConnected && isOwner === false && (
        <div className="flex items-center gap-2 p-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
          Connected wallet is not the vault owner — setExcessPolicy will revert.
        </div>
      )}

      {policyNum !== undefined && (
        <p className="text-xs text-zinc-600 mb-3">
          Current:{" "}
          <span className="font-semibold">{EXCESS_POLICY_LABELS[policyNum] ?? `Policy ${policyNum}`}</span>
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {([0, 1] as const).map((policy) => (
          <Button
            key={policy}
            variant={policyNum === policy ? "primary" : "outline"}
            size="sm"
            onClick={() => handleSet(policy)}
            disabled={!isConnected || isOwner === false || action.isPending || action.isConfirming}
            isLoading={action.isPending && policyNum !== policy}
          >
            {policy === 0 ? "Keep" : "BurnToMatch"}
          </Button>
        ))}
      </div>

      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="Vault excess policy updated on-chain."
      />
    </div>
  );
}
