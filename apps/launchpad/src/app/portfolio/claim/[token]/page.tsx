"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Button, Spinner } from "@/components/atoms";
import { VestingCard } from "@/components/organisms";
import { DashboardLayout } from "@/components/templates";
import {
  getVesting,
  claimVesting,
  type VestingSchedule,
} from "@/lib/api/repositories/portfolio.repository";
import { SALE_ABI } from "@/lib/contracts/saleAbi";
import { VAULT_ABI } from "@/lib/contracts/vaultAbi";

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

  const { isConnected } = useAccount();

  // Direct mode: Sale.claimTokens()
  const {
    writeContract: writeSaleClaim,
    data: saleClaimHash,
    isPending: isSaleClaimPending,
    error: saleClaimError,
  } = useWriteContract();

  const { isLoading: isSaleClaimConfirming, isSuccess: isSaleClaimSuccess } =
    useWaitForTransactionReceipt({ hash: saleClaimHash });

  // Vested mode: CiretaVault.claim()
  const {
    writeContract: writeVaultClaim,
    data: vaultClaimHash,
    isPending: isVaultClaimPending,
    error: vaultClaimError,
  } = useWriteContract();

  const { isLoading: isVaultClaimConfirming, isSuccess: isVaultClaimSuccess } =
    useWaitForTransactionReceipt({ hash: vaultClaimHash });

  useEffect(() => {
    paramsPromise.then(setResolvedParams);
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedParams) return;
    (async () => {
      try {
        const schedules = await getVesting(resolvedParams.token);
        if (schedules.length > 0) setSchedule(schedules[0] ?? null);
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

  // Surface contract errors
  useEffect(() => {
    const err = saleClaimError ?? vaultClaimError;
    if (err) {
      setClaimError(err.message.includes("User rejected")
        ? "Transaction rejected"
        : "Claim failed — check your wallet and try again");
    }
  }, [saleClaimError, vaultClaimError]);

  if (!resolvedParams) return null;

  const handleClaim = () => {
    if (!schedule) return;
    setClaimError(null);

    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }

    const isVested = schedule.sale_mode === "vested" && schedule.vault_address;

    if (isVested && schedule.vault_address) {
      writeVaultClaim({
        address: schedule.vault_address as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "claim",
      });
    } else if (schedule.sale_contract_address) {
      writeSaleClaim({
        address: schedule.sale_contract_address as `0x${string}`,
        abi: SALE_ABI,
        functionName: "claimTokens",
      });
    } else {
      setClaimError("No contract address available for claiming");
    }
  };

  const isClaimLoading =
    isSaleClaimPending || isVaultClaimPending || isSaleClaimConfirming || isVaultClaimConfirming;

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
    return (
      <DashboardLayout title="Claim Tokens">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-20"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-text mb-4">Tokens Claimed!</h1>
          <p className="text-gray-500 mb-8">
            {claimedAmt} {schedule.token_symbol} tokens have been claimed to your wallet.
          </p>
          <div className="space-y-3">
            <Button variant="primary" className="w-full" onClick={() => setShowSuccess(false)}>
              Claim More
            </Button>
            <Link href="/portfolio">
              <Button variant="outline" className="w-full">
                Back to Portfolio
              </Button>
            </Link>
          </div>
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
          {claimError && (
            <p className="mt-4 text-sm text-red-500 text-center">{claimError}</p>
          )}
          {(isSaleClaimConfirming || isVaultClaimConfirming) && (
            <p className="mt-4 text-sm text-gray-400 text-center">
              Confirming on-chain&hellip;
            </p>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
