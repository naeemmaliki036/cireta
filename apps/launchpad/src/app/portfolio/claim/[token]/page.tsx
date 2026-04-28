"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAccount } from "wagmi";
import { Button, Spinner } from "@/components/atoms";
import { VestingCard } from "@/components/organisms";
import { DashboardLayout } from "@/components/templates";
import {
  getVesting,
  claimVesting,
  type VestingSchedule,
} from "@/lib/api/repositories/portfolio.repository";
import { apiPost } from "@/lib/api/client";
import { SALE_ABI } from "@/lib/contracts/saleAbi";
import { VAULT_ABI } from "@/lib/contracts/vaultAbi";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";

export default function ClaimTokenPage({
  params: paramsPromise,
}: {
  params: Promise<{ token: string }>;
}) {
  const [resolvedParams, setResolvedParams] = useState<{ token: string } | null>(null);
  const [schedule, setSchedule] = useState<VestingSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [claimedAmt, setClaimedAmt] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [saleStatus, setSaleStatus] = useState<string | null>(null);

  const { isConnected } = useAccount();

  // Unified contract actions for different claim types
  const saleClaimAction = useContractAction();
  const vaultClaimAction = useContractAction();
  const refundAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  // Derived states for compatibility
  const saleClaimHash = saleClaimAction.txHash;
  const isSaleClaimPending = saleClaimAction.isPending;
  const isSaleClaimConfirming = saleClaimAction.isConfirming;
  const isSaleClaimSuccess = saleClaimAction.isConfirmed;
  const saleClaimError = saleClaimAction.error;

  const vaultClaimHash = vaultClaimAction.txHash;
  const isVaultClaimPending = vaultClaimAction.isPending;
  const isVaultClaimConfirming = vaultClaimAction.isConfirming;
  const isVaultClaimSuccess = vaultClaimAction.isConfirmed;
  const vaultClaimError = vaultClaimAction.error;

  const refundHash = refundAction.txHash;
  const isRefundPending = refundAction.isPending;
  const isRefundConfirming = refundAction.isConfirming;
  const isRefundSuccess = refundAction.isConfirmed;
  const refundError = refundAction.error;

  useEffect(() => {
    paramsPromise.then(setResolvedParams);
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedParams) return;
    (async () => {
      try {
        const schedules = await getVesting(resolvedParams.token);
        if (schedules.length > 0) setSchedule(schedules[0] ?? null);
        // Check sale status to determine if refund is available
        const saleRes = await fetch(`/api/v1/sales?token_id=${resolvedParams.token}`);
        if (saleRes.ok) {
          const data = await saleRes.json();
          const sale = data.sales?.[0];
          if (sale) setSaleStatus(sale.status);
        }
      } catch (err) {
        console.error("Failed to load vesting schedule:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [resolvedParams]);

  // Handle on-chain claim success → record in backend
  useEffect(() => {
    const txHash = saleClaimHash ?? vaultClaimHash;
    const isSuccess = isSaleClaimSuccess || isVaultClaimSuccess;
    if (isSuccess && txHash && schedule) {
      (async () => {
        try {
          const result = await claimVesting(schedule.id, txHash);
          setClaimedAmt(result.claimed_amount);
          setShowSuccess(true);
        } catch {
          setClaimedAmt(schedule.claimable_amount);
          setShowSuccess(true);
        }
      })();
    }
  }, [isSaleClaimSuccess, isVaultClaimSuccess, saleClaimHash, vaultClaimHash, schedule]);

  // Handle on-chain refund success → record in backend
  useEffect(() => {
    if (isRefundSuccess && refundHash && schedule) {
      (async () => {
        try {
          await apiPost(`/api/v1/sales/${schedule.token_id}/refund?tx_hash=${refundHash}`, {});
          setClaimedAmt("Refund");
          setShowSuccess(true);
        } catch {
          setShowSuccess(true);
          setClaimedAmt("Refund");
        }
      })();
    }
  }, [isRefundSuccess, refundHash, schedule]);

  // Surface contract errors
  useEffect(() => {
    const err = saleClaimError ?? vaultClaimError ?? refundError;
    if (err) {
      setClaimError(err.message.includes("User rejected")
        ? "Transaction rejected"
        : "Transaction failed — check your wallet and try again");
    }
  }, [saleClaimError, vaultClaimError, refundError]);

  if (!resolvedParams) return null;

  const isFailedSale = saleStatus === "failed" || saleStatus === "finalized_failed" || saleStatus === "refunds_enabled";

  const handleClaim = async () => {
    if (!schedule) return;
    setClaimError(null);

    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }

    const isVested = schedule.sale_mode === "vested" && schedule.vault_address;

    try {
      if (isVested && schedule.vault_address) {
        await vaultClaimAction.execute({
          address: schedule.vault_address as `0x${string}`,
          abi: VAULT_ABI,
          functionName: "claim",
          // gas automatically handled by useContractAction (500k for claims)
        });
        showSuccess("Tokens Claimed", `${schedule.claimable_amount} ${schedule.token_symbol} tokens have been claimed to your wallet.`);
      } else if (schedule.sale_contract_address) {
        await saleClaimAction.execute({
          address: schedule.sale_contract_address as `0x${string}`,
          abi: SALE_ABI,
          functionName: "claimTokens",
          // gas automatically handled by useContractAction (500k for claims)
        });
        showSuccess("Tokens Claimed", `${schedule.claimable_amount} ${schedule.token_symbol} tokens have been claimed to your wallet.`);
      } else {
        setClaimError("No contract address available for claiming");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Claim failed";
      setClaimError(errorMsg);
      showError("Claim Failed", errorMsg);
    }
  };

  const handleRefund = async () => {
    if (!schedule) return;
    setClaimError(null);

    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }

    try {
      if (schedule.sale_contract_address) {
        await refundAction.execute({
          address: schedule.sale_contract_address as `0x${string}`,
          abi: SALE_ABI,
          functionName: "claimRefund",
          // gas automatically handled by useContractAction (500k for claims)
        });
        showSuccess("Refund Claimed", "Your USDC refund has been sent to your wallet.");
      } else {
        setClaimError("No contract address available for refund");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Refund failed";
      setClaimError(errorMsg);
      showError("Refund Failed", errorMsg);
    }
  };

  const isClaimLoading =
    isSaleClaimPending || isVaultClaimPending || isSaleClaimConfirming || isVaultClaimConfirming;
  const isRefundLoading = isRefundPending || isRefundConfirming;

  if (loading) {
    return (
      <DashboardLayout title="Claim Tokens">
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!schedule) {
    return (
      <DashboardLayout title="Claim Tokens">
        <p className="text-center text-gray-400 py-24">No vesting schedule found</p>
      </DashboardLayout>
    );
  }

  if (showSuccess) {
    const isRefund = claimedAmt === "Refund";
    return (
      <DashboardLayout title={isRefund ? "Refund Claimed" : "Claim Tokens"}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-20"
        >
          <div className={`w-20 h-20 rounded-full ${isRefund ? "bg-amber-100" : "bg-green-100"} flex items-center justify-center mx-auto mb-6`}>
            <CheckCircle2 className={`w-10 h-10 ${isRefund ? "text-amber-600" : "text-green-600"}`} />
          </div>
          <h1 className="text-2xl font-semibold text-text mb-4">
            {isRefund ? "Refund Claimed!" : "Tokens Claimed!"}
          </h1>
          <p className="text-gray-500 mb-8">
            {isRefund
              ? "Your USDC refund has been sent to your wallet."
              : `${claimedAmt} ${schedule.token_symbol} tokens have been claimed to your wallet.`}
          </p>
          <Link href="/portfolio">
            <Button variant="outline" className="w-full">
              Back to Portfolio
            </Button>
          </Link>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Claim Tokens">
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-text transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Portfolio
      </Link>
      <div className="max-w-lg">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          {isFailedSale ? (
            <div className="bg-white rounded-xl border border-amber-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
                <h2 className="text-lg font-semibold text-text">Sale Did Not Reach Soft Cap</h2>
              </div>
              <p className="text-black/60 text-sm mb-6">
                This sale has been completed without reaching its soft cap. You can claim your USDC refund directly from the smart contract.
              </p>
              <Button
                variant="primary"
                className="w-full"
                onClick={handleRefund}
                disabled={isRefundLoading}
              >
                {isRefundLoading ? "Processing Refund..." : "Claim Refund"}
              </Button>
              {isRefundConfirming && (
                <p className="mt-4 text-sm text-gray-400 text-center">
                  Confirming on-chain&hellip;
                </p>
              )}
            </div>
          ) : (
            <VestingCard
              tokenName={schedule.token_name}
              tokenSymbol={schedule.token_symbol}
              totalAmount={parseFloat(schedule.total_amount)}
              claimedAmount={parseFloat(schedule.claimed_amount)}
              claimableAmount={parseFloat(schedule.claimable_amount)}
              cliffEnd={new Date(schedule.cliff_end)}
              vestingEnd={new Date(schedule.vesting_end)}
              lastClaimDate={schedule.last_claim_at ? new Date(schedule.last_claim_at) : undefined}
              onClaim={handleClaim}
              isClaimLoading={isClaimLoading}
            />
          )}
          {claimError && (
            <p className="mt-4 text-sm text-red-500 text-center">{claimError}</p>
          )}
          {(isSaleClaimConfirming || isVaultClaimConfirming) && !isFailedSale && (
            <p className="mt-4 text-sm text-gray-400 text-center">
              Confirming on-chain&hellip;
            </p>
          )}
        </motion.div>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
