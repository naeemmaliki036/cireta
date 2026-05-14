"use client";

import { useMemo, useState } from "react";
import type { Abi } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AlertCircle, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/atoms";
import { CountrySelect } from "@/components/molecules/CountrySelect";
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

  // Resolve the user's residence/jurisdiction country (used both as default
  // and as the comparison anchor for the mismatch banner).
  const residenceCountry = useMemo(
    () => resolveCountry(wallet.user_country_code),
    [wallet.user_country_code],
  );

  const [selectedNumeric, setSelectedNumeric] = useState<number | null>(
    residenceCountry?.numeric ?? null,
  );
  const [mismatchAck, setMismatchAck] = useState(false);
  const [step, setStep] = useState<"pick" | "confirm">("pick");

  const selectedCountry = useMemo(
    () => (selectedNumeric ? resolveCountry(selectedNumeric) : null),
    [selectedNumeric],
  );

  const countryMismatch = !!(
    residenceCountry &&
    selectedCountry &&
    residenceCountry.numeric !== selectedCountry.numeric
  );

  // Hard gates — country MUST be a real numeric code (no 0), and the admin
  // must explicitly ack any mismatch with the user's residence country.
  const canSubmit =
    !!selectedCountry &&
    selectedCountry.numeric > 0 &&
    (!countryMismatch || mismatchAck);

  const handleRegister = async (): Promise<void> => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!canSubmit || !selectedCountry) return;
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
      args: [wallet.address_checksum as `0x${string}`, selectedCountry.numeric],
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

      <div className="relative bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#13636F]" />
            <h2 className="text-base font-semibold text-zinc-900">
              {step === "confirm" ? "Confirm Wallet Registration" : "Register Wallet On-Chain"}
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
          {/* Wallet info callout — always visible */}
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
                  User&apos;s residence
                </p>
                <p className="text-xs text-zinc-700">
                  {residenceCountry
                    ? `${residenceCountry.name} · ${residenceCountry.numeric}`
                    : wallet.user_country_code
                      ? `${wallet.user_country_code} — code not found`
                      : "Not set"}
                </p>
              </div>
            </div>
          </div>

          {step === "pick" && (
            <>
              {/* Country picker */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  On-chain country code
                  {residenceCountry && (
                    <span className="ml-1 text-zinc-400 font-normal">
                      (default: {residenceCountry.name})
                    </span>
                  )}
                </label>
                <CountrySelect
                  mode="numeric"
                  value={selectedNumeric}
                  onChange={(v) => {
                    setSelectedNumeric(v === null ? null : Number(v));
                    setMismatchAck(false);
                  }}
                  placeholder="Select country"
                />
              </div>

              {/* Country mismatch banner */}
              {countryMismatch && residenceCountry && selectedCountry && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-semibold mb-0.5">Country code mismatch</p>
                      <p>
                        You selected{" "}
                        <span className="font-medium">
                          {selectedCountry.name} ({selectedCountry.numeric})
                        </span>
                        , but this user&apos;s residence is{" "}
                        <span className="font-medium">
                          {residenceCountry.name} ({residenceCountry.numeric})
                        </span>
                        . Registering with a different code can affect compliance
                        checks (CountryAllow, MaxOwnership) and the audit trail.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mismatchAck}
                      onChange={(e) => setMismatchAck(e.target.checked)}
                      className="rounded"
                    />
                    I understand and want to proceed with this country anyway.
                  </label>
                </div>
              )}

              {!selectedCountry && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Pick a country before continuing. Registering with code{" "}
                  <strong>0</strong> is not allowed.
                </p>
              )}
            </>
          )}

          {step === "confirm" && selectedCountry && (
            <>
              <div className="rounded-lg border border-zinc-200 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Country (on-chain)
                  </span>
                  <span className="text-sm font-medium text-zinc-900">
                    {selectedCountry.name} · {selectedCountry.numeric}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Function
                  </span>
                  <span className="text-xs font-mono text-zinc-700">
                    addToWhitelist(address, uint16)
                  </span>
                </div>
                {countryMismatch && residenceCountry && (
                  <p className="text-[11px] text-amber-700 pt-1 border-t border-zinc-100">
                    Note: country differs from user&apos;s residence ({residenceCountry.name}).
                    You ticked the consent box.
                  </p>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                You&apos;re about to sign an on-chain transaction. Double-check the
                wallet address and country code before confirming — this writes
                to the platform identity registry.
              </p>

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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
          {step === "pick" && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep("confirm")}
                disabled={!canSubmit}
              >
                Review
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={isRegistered ? onSuccess : () => setStep("pick")}
                disabled={isBusy}
              >
                {isRegistered ? "Close" : "Back"}
              </Button>
              {!isRegistered && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRegister}
                  disabled={isBusy || !canSubmit}
                  isLoading={isBusy}
                >
                  Confirm registration
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
