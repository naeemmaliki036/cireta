"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/atoms";
import { CountrySelect } from "@/components/molecules/CountrySelect";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { getAddresses } from "@/lib/contracts/addresses";

interface UpdateIssuerModalProps {
  issuerWallet: string;
  issuerName: string;
  issuerJurisdiction: string;
  onClose: () => void;
}

/**
 * Molecule: modal for IssuerRegistry.updateIssuer(wallet, newName, newJurisdiction).
 * Requires ISSUER_MANAGER_ROLE or owner on IssuerRegistry.
 */
export function UpdateIssuerModal({
  issuerWallet,
  issuerName,
  issuerJurisdiction,
  onClose,
}: UpdateIssuerModalProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [name, setName] = useState(issuerName);
  const [jurisdiction, setJurisdiction] = useState(issuerJurisdiction);

  const registryAddr = getAddresses().issuerRegistry;

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!registryAddr) return;
    if (!isAddress(issuerWallet)) return;
    action.reset();
    const receipt = await action.execute({
      address: registryAddr,
      abi: ISSUER_REGISTRY_ABI as unknown as Abi,
      functionName: "updateIssuer",
      args: [issuerWallet as `0x${string}`, name.trim(), jurisdiction.trim()],
    });
    if (receipt) {
      // Close after brief delay so the user can see the confirmed status
      setTimeout(onClose, 1500);
    }
  };

  if (!registryAddr) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
          <p className="text-sm text-red-600">IssuerRegistry address not configured.</p>
          <Button variant="outline" size="sm" onClick={onClose} className="mt-4">Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-900">Edit Issuer On-Chain</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Wallet</label>
            <p className="text-xs font-mono text-zinc-700 bg-zinc-50 rounded-lg px-3 py-2 break-all">
              {issuerWallet}
            </p>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              placeholder="Issuer legal name"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Jurisdiction</label>
            <CountrySelect
              mode="alpha2"
              value={jurisdiction}
              onChange={(v) => setJurisdiction(typeof v === "string" ? v : "")}
              placeholder="Select jurisdiction"
            />
          </div>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
            Connect your wallet to sign this transaction.
          </div>
        )}

        <TransactionStatus
          isPending={action.isPending}
          isConfirming={action.isConfirming}
          isConfirmed={action.isConfirmed}
          txHash={action.txHash}
          txUrl={action.txUrl}
          error={action.error}
          successMessage="Issuer updated on-chain."
        />

        <div className="flex gap-3 mt-4">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1" disabled={action.isPending || action.isConfirming}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            className="flex-1"
            disabled={!name.trim() || action.isPending || action.isConfirming}
            isLoading={action.isPending || action.isConfirming}
          >
            Save On-Chain
          </Button>
        </div>
      </div>
    </div>
  );
}
