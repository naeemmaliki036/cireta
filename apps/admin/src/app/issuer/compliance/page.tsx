"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Unlock, ArrowLeftRight, RotateCcw, X, AlertTriangle, Pause, Play, ShieldOff, Shield } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi, isAddress } from "viem";
import { Button, Input, Spinner } from "@/components/atoms";
import { AuditLogRow } from "@/components/molecules";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import {
  getAuditLogs, type AuditLogEntry,
} from "@/lib/api/repositories/compliance";
import type { ComplianceAction } from "@/components/molecules";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";

type ActionType = "freeze" | "unfreeze" | "freeze_partial" | "unfreeze_partial" | "forced_transfer" | "recover" | "pause" | "unpause" | null;

const ACTION_CARDS = [
  { action: "freeze" as const, icon: Lock, title: "Freeze Address", desc: "Prevent an address from transferring tokens", color: "text-red-600", bg: "bg-red-100" },
  { action: "unfreeze" as const, icon: Unlock, title: "Unfreeze Address", desc: "Restore transfer rights to an address", color: "text-green-600", bg: "bg-green-100" },
  { action: "freeze_partial" as const, icon: ShieldOff, title: "Freeze Partial", desc: "Freeze a specific token amount on an address", color: "text-orange-600", bg: "bg-orange-100" },
  { action: "unfreeze_partial" as const, icon: Shield, title: "Unfreeze Partial", desc: "Release a specific frozen amount", color: "text-teal-600", bg: "bg-teal-100" },
  { action: "forced_transfer" as const, icon: ArrowLeftRight, title: "Forced Transfer", desc: "Forcibly move tokens between addresses", color: "text-amber-600", bg: "bg-amber-100" },
  { action: "recover" as const, icon: RotateCcw, title: "Recover Tokens", desc: "Recover tokens from a lost wallet", color: "text-purple-600", bg: "bg-purple-100" },
];

export default function CompliancePage() {
  const [modalAction, setModalAction] = useState<ActionType>(null);
  const [targetAddress, setTargetAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedTokenAddr, setSelectedTokenAddr] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(false);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const pauseAction = useContractAction();

  // Read on-chain paused state for selected token
  const { data: onChainPaused, refetch: refetchPaused } = useReadContract({
    address: selectedTokenAddr as `0x${string}`,
    abi: CIRETA_TOKEN_ABI as unknown as Abi,
    functionName: "paused",
    query: { enabled: !!selectedTokenAddr },
  });
  const isPaused = typeof onChainPaused === "boolean" ? onChainPaused : false;

  // Load tokens and audit logs
  useEffect(() => {
    (async () => {
      try {
        const [tokenData, logData] = await Promise.all([
          getTokens(),
          getAuditLogs(1, 20).catch(() => ({ items: [] })),
        ]);
        setTokens(tokenData.items.filter((t) => t.contract_address && t.contract_address !== "0x0000000000000000000000000000000000000000"));
        setAuditLogs(logData.items ?? []);
      } catch {
        setLogsError(true);
      }
      setLogsLoading(false);
    })();
  }, []);

  const selectedToken = tokens.find((t) => t.contract_address === selectedTokenAddr);

  const handleSubmit = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!selectedTokenAddr || !targetAddress) return;

    action.reset();

    if (modalAction === "freeze") {
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "setAddressFrozen",
        args: [targetAddress as `0x${string}`, true],
      });
    } else if (modalAction === "unfreeze") {
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "setAddressFrozen",
        args: [targetAddress as `0x${string}`, false],
      });
    } else if (modalAction === "freeze_partial") {
      const decimals = selectedToken?.decimals ?? 6;
      const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "freezePartialTokens",
        args: [targetAddress as `0x${string}`, rawAmount],
      });
    } else if (modalAction === "unfreeze_partial") {
      const decimals = selectedToken?.decimals ?? 6;
      const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "unfreezePartialTokens",
        args: [targetAddress as `0x${string}`, rawAmount],
      });
    } else if (modalAction === "forced_transfer") {
      const decimals = selectedToken?.decimals ?? 6;
      const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "forcedTransfer",
        args: [targetAddress as `0x${string}`, destinationAddress as `0x${string}`, rawAmount],
      });
    } else if (modalAction === "recover") {
      await action.execute({
        address: selectedTokenAddr as `0x${string}`,
        abi: CIRETA_TOKEN_ABI as unknown as Abi,
        functionName: "recoveryAddress",
        args: [
          targetAddress as `0x${string}`,
          destinationAddress as `0x${string}`,
          "0x0000000000000000000000000000000000000000" as `0x${string}`, // onchainID — not used in simple mode
        ],
      });
    }
  };

  const handlePauseToggle = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!selectedTokenAddr) return;
    pauseAction.reset();
    const fnName = isPaused ? "unpause" : "pause";
    const receipt = await pauseAction.execute({
      address: selectedTokenAddr as `0x${string}`,
      abi: CIRETA_TOKEN_ABI as unknown as Abi,
      functionName: fnName,
    });
    if (receipt) {
      await refetchPaused();
    }
  };

  const resetModal = () => {
    setModalAction(null);
    setTargetAddress("");
    setDestinationAddress("");
    setAmount("");
    action.reset();
  };

  const activeCard = ACTION_CARDS.find((c) => c.action === modalAction);

  return (
    <IssuerDashboardLayout title="Compliance Actions" description="Freeze addresses, force transfers, recover tokens">
      {/* Token Selector */}
      <div className="bg-white rounded-lg border border-zinc-100 p-5 mb-6">
        <label className="block text-sm font-semibold text-zinc-900 mb-2">Select Token</label>
        <p className="text-xs text-zinc-400 mb-3">Choose which deployed token to perform compliance actions on.</p>
        {tokens.length === 0 ? (
          <p className="text-sm text-zinc-400">No deployed tokens found. Deploy a token first.</p>
        ) : (
          <select
            value={selectedTokenAddr}
            onChange={(e) => setSelectedTokenAddr(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          >
            <option value="">Select a token...</option>
            {tokens.map((t) => (
              <option key={t.id} value={t.contract_address!}>
                {t.name} ({t.symbol}) — {t.contract_address!.slice(0, 6)}...{t.contract_address!.slice(-4)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Action Cards — only show when token selected */}
      {selectedTokenAddr && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {ACTION_CARDS.map((card) => (
            <motion.button key={card.action} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              onClick={() => { action.reset(); setModalAction(card.action); }}
              className="bg-white rounded-lg p-5 border border-zinc-100 text-left hover:border-darkAqua transition-colors">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <h3 className="font-semibold text-sm text-text mb-0.5">{card.title}</h3>
              <p className="text-xs text-zinc-500">{card.desc}</p>
            </motion.button>
          ))}
        </div>
      )}

      {/* Pause / Unpause — shown when token selected */}
      {selectedTokenAddr && (
        <div className="bg-white rounded-lg border border-zinc-100 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Token Pause Control</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isPaused
                  ? "Token is currently paused. All transfers are blocked."
                  : "Token is active. Pausing will block all transfers."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${isPaused ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? "bg-red-500" : "bg-green-500"}`} />
                {isPaused ? "Paused" : "Active"}
              </span>
              {isPaused ? (
                <Button variant="primary" size="sm"
                  leftIcon={<Play className="h-4 w-4" />}
                  onClick={handlePauseToggle}
                  disabled={pauseAction.isPending || pauseAction.isConfirming}
                  isLoading={pauseAction.isPending || pauseAction.isConfirming}>
                  Unpause Token
                </Button>
              ) : (
                <Button variant="outline" size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  leftIcon={<Pause className="h-4 w-4" />}
                  onClick={handlePauseToggle}
                  disabled={pauseAction.isPending || pauseAction.isConfirming}
                  isLoading={pauseAction.isPending || pauseAction.isConfirming}>
                  Pause Token
                </Button>
              )}
            </div>
          </div>
          <TransactionStatus
            isPending={pauseAction.isPending}
            isConfirming={pauseAction.isConfirming}
            isConfirmed={pauseAction.isConfirmed}
            txHash={pauseAction.txHash}
            txUrl={pauseAction.txUrl}
            error={pauseAction.error}
            successMessage={isPaused ? "Token paused on-chain." : "Token unpaused on-chain."}
          />
        </div>
      )}

      {!selectedTokenAddr && (
        <div className="text-center py-12 mb-8">
          <AlertTriangle className="h-8 w-8 text-zinc-200 mx-auto mb-2" />
          <p className="text-sm text-zinc-400">Select a token above to access compliance actions</p>
        </div>
      )}

      {/* Audit Log */}
      <div className="bg-white rounded-lg p-6 border border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-900 mb-4">Audit Log</h2>
        {logsLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : logsError ? (
          <p className="text-center text-zinc-400 py-8">Failed to load audit logs</p>
        ) : auditLogs.length === 0 ? (
          <p className="text-center text-zinc-400 py-8">No compliance actions yet</p>
        ) : (
          <div className="space-y-3">
            {auditLogs.map((log, i) => (
              <AuditLogRow key={log.id} action={log.action as ComplianceAction}
                actorWallet={log.actor_id ?? ""} targetWallet={log.target_id}
                targetType={log.target_type ?? "wallet"} timestamp={log.created_at}
                details={log.reason ?? ""} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {modalAction && activeCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={resetModal}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${activeCard.bg} flex items-center justify-center`}>
                  <activeCard.icon className={`h-4 w-4 ${activeCard.color}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900">{activeCard.title}</h2>
                  <p className="text-xs text-zinc-400">{selectedToken?.name} ({selectedToken?.symbol})</p>
                </div>
              </div>
              <button onClick={resetModal} className="p-1.5 hover:bg-zinc-100 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tx status */}
            {(action.isPending || action.isConfirming || action.isConfirmed || action.error) && (
              <div className="mb-4">
                <TransactionStatus isPending={action.isPending} isConfirming={action.isConfirming}
                  isConfirmed={action.isConfirmed} txHash={action.txHash} txUrl={action.txUrl}
                  error={action.error} successMessage="Action completed." />
              </div>
            )}

            {!action.isConfirmed && (
              <div className="space-y-3">
                <Input label="Target Address" value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)} placeholder="0x..."
                  error={targetAddress && !isAddress(targetAddress) ? "Invalid EVM address" : undefined} />

                {(modalAction === "forced_transfer" || modalAction === "recover") && (
                  <Input label="Destination Address" value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)} placeholder="0x..."
                    error={destinationAddress && !isAddress(destinationAddress) ? "Invalid EVM address" : undefined} />
                )}

                {(modalAction === "forced_transfer" || modalAction === "freeze_partial" || modalAction === "unfreeze_partial") && (
                  <Input label={`Amount (${selectedToken?.symbol ?? "tokens"})`} type="number" value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={resetModal}>Cancel</Button>
                  <Button variant="primary" className="flex-1" onClick={handleSubmit}
                    disabled={
                      action.isPending ||
                      action.isConfirming ||
                      !targetAddress ||
                      !isAddress(targetAddress) ||
                      ((modalAction === "freeze_partial" || modalAction === "unfreeze_partial" || modalAction === "forced_transfer") && (!amount || Number(amount) <= 0)) ||
                      ((modalAction === "forced_transfer" || modalAction === "recover") && (!destinationAddress || !isAddress(destinationAddress)))
                    }
                    isLoading={action.isPending || action.isConfirming}>
                    {!isConnected ? "Connect Wallet" : "Confirm"}
                  </Button>
                </div>
              </div>
            )}

            {action.isConfirmed && (
              <Button variant="outline" className="w-full" onClick={resetModal}>Close</Button>
            )}
          </motion.div>
        </div>
      )}
    </IssuerDashboardLayout>
  );
}
