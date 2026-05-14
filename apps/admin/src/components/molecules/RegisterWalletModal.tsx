"use client";

import { useState } from "react";
import type { Abi } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { X, ShieldCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { getTxExplorerUrl } from "@/lib/contracts/explorer";
import { resolveCountry } from "@/lib/countries";
import { markWalletRegistered } from "@/lib/api/repositories/admin-wallets";
import type { AdminWallet } from "@/lib/api/repositories/admin-wallets";

interface RegisterWalletModalProps {
  wallet: AdminWallet;
  onClose: () => void;
  onSuccess: () => void;
}

function getIdentityRegistryAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
  if (!addr) throw new Error("NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS is not set");
  return addr as `0x${string}`;
}

export function RegisterWalletModal({
  wallet,
  onClose,
  onSuccess,
}: RegisterWalletModalProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [backendError, setBackendError] = useState<string | null>(null);
  const [finalTxHash, setFinalTxHash] = useState<string | null>(null);

  // Resolve numeric country code for on-chain call
  const country = resolveCountry(wallet.user_country_code);
  const numericCode = country?.numeric ?? 0;

  const handleRegister = async (): Promise<void> => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    setBackendError(null);
    action.reset();

    let registryAddress: `0x${string}`;
    try {
      registryAddress = getIdentityRegistryAddress();
    } catch (e) {
      setBackendError(e instanceof Error ? e.message : "Registry address not configured");
      return;
    }

    const receipt = await action.execute({
      address: registryAddress,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "addToWhitelist",
      args: [wallet.address_checksum as `0x${string}`, numericCode],
    });

    if (!receipt) return; // error shown by TransactionStatus

    const hash = receipt.transactionHash;
    setFinalTxHash(hash);

    try {
      await markWalletRegistered(wallet.id, hash);
      onSuccess();
    } catch (e) {
      setBackendError(
        e instanceof Error ? e.message : "On-chain confirmed but backend update failed",
      );
    }
  };

  const isBusy = action.isPending || action.isConfirming;
  const isRegistered = action.isConfirmed && !backendError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={isBusy ? undefined : onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#13636F]" />
            <h2 className="text-base font-semibold text-zinc-900">
              Register Wallet On-Chain
            </h2>
          </div>
          <button
            onClick={isBusy ? undefined : onClose}
            disabled={isBusy}
            className="text-zinc-400 hover:text-zinc-600 transition-colors disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Wallet info callout */}
          <div className="rounded-lg bg-[#ECF3F4] px-4 py-3 space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">
                Wallet Address
              </p>
              <p className="font-mono text-sm text-zinc-900 break-all">
                {wallet.address_checksum}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">
                  User
                </p>
                <p className="text-xs text-zinc-700 truncate">
                  {wallet.user_display_name ?? wallet.user_email}
                </p>
                <p className="text-[10px] text-zinc-400 truncate">{wallet.user_email}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">
                  Country (on-chain)
                </p>
                <p className="text-xs text-zinc-700">
                  {country
                    ? `${country.name} (${numericCode})`
                    : wallet.user_country_code
                      ? `${wallet.user_country_code} — code not found`
                      : "Not set"}
                </p>
              </div>
            </div>
          </div>

          {!country && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Country code could not be resolved to a numeric value. The on-chain
              call will use <strong>0</strong> — confirm this is intentional.
            </p>
          )}

          <TransactionStatus
            isPending={action.isPending}
            isConfirming={action.isConfirming}
            isConfirmed={action.isConfirmed}
            txHash={action.txHash}
            txUrl={action.txUrl}
            error={action.error}
            successMessage="Wallet registered on-chain. Updating backend record..."
          />

          {backendError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {backendError}
            </p>
          )}

          {isRegistered && finalTxHash && (
            <a
              href={getTxExplorerUrl(finalTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#13636F] hover:underline font-mono"
            >
              <span>{finalTxHash.slice(0, 12)}...{finalTxHash.slice(-8)}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={isRegistered ? onSuccess : onClose}
            disabled={isBusy}
          >
            {isRegistered ? "Close" : "Cancel"}
          </Button>
          {!isRegistered && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRegister}
              disabled={isBusy}
              isLoading={isBusy}
            >
              Register
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
