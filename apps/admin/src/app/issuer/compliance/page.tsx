"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Unlock, ArrowLeftRight, RotateCcw, X } from "lucide-react";
import { Button, Input, Spinner } from "@/components/atoms";
import { AuditLogRow } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import {
  freezeAddress, unfreezeAddress, forcedTransfer, recoverTokens,
  getAuditLogs, type AuditLogEntry,
} from "@/lib/api/repositories/compliance";
import type { ComplianceAction } from "@/components/molecules";
import { getAccessToken } from "@/lib/api/client";

function getToken() {
  return getAccessToken() ?? "";
}

type ActionType = "freeze" | "unfreeze" | "forced_transfer" | "recover" | null;

const ACTION_CARDS = [
  { action: "freeze" as const, icon: Lock, title: "Freeze Address", desc: "Prevent an address from transferring tokens", color: "text-red-600", bg: "bg-red-100" },
  { action: "unfreeze" as const, icon: Unlock, title: "Unfreeze Address", desc: "Restore transfer rights to an address", color: "text-green-600", bg: "bg-green-100" },
  { action: "forced_transfer" as const, icon: ArrowLeftRight, title: "Forced Transfer", desc: "Forcibly move tokens between addresses", color: "text-yellow-600", bg: "bg-yellow-100" },
  { action: "recover" as const, icon: RotateCcw, title: "Recover Tokens", desc: "Recover tokens from a lost wallet", color: "text-purple-600", bg: "bg-purple-100" },
];

export default function CompliancePage() {
  const [modalAction, setModalAction] = useState<ActionType>(null);
  const [targetAddress, setTargetAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [selectedToken, setSelectedToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAuditLogs(1, 20, undefined, getToken());
        setAuditLogs(data.items);
      } catch (err) { console.error("Failed to load compliance data:", err); }
      finally { setLogsLoading(false); }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!targetAddress || !reason) return;

    setIsSubmitting(true);
    setFeedback(null);
    const token = getToken();
    try {
      if (modalAction === "freeze") {
        await freezeAddress({ wallet_address: targetAddress, reason }, token);
      } else if (modalAction === "unfreeze") {
        await unfreezeAddress({ wallet_address: targetAddress, reason }, token);
      } else if (modalAction === "forced_transfer") {
        await forcedTransfer({ token_id: selectedToken, from_address: targetAddress, to_address: destinationAddress, amount, reason }, token);
      } else if (modalAction === "recover") {
        await recoverTokens({ token_id: selectedToken, from_address: targetAddress, amount, reason }, token);
      }
      const data = await getAuditLogs(1, 20, undefined, token);
      setAuditLogs(data.items);
      setFeedback({ type: "success", message: `${modalAction?.replace("_", " ")} action completed successfully.` });
      setTimeout(() => setFeedback(null), 5000);
    } catch (e: unknown) {
      setFeedback({ type: "error", message: e instanceof Error ? e.message : "Action failed. Please try again." });
      setTimeout(() => setFeedback(null), 5000);
    }
    setIsSubmitting(false);
    setModalAction(null);
    setTargetAddress(""); setReason(""); setDestinationAddress(""); setAmount(""); setSelectedToken("");
  };

  const activeCard = ACTION_CARDS.find((c) => c.action === modalAction);

  return (
    <IssuerDashboardLayout title="Compliance Actions" description="Freeze addresses, force transfers, recover tokens">
      {feedback && (
        <div className={`mb-6 p-4 rounded-2xl border ${feedback.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          <p className="text-sm font-medium">{feedback.message}</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {ACTION_CARDS.map((card) => (
          <motion.button key={card.action} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
            onClick={() => setModalAction(card.action)}
            className="bg-white rounded-3xl p-6 border border-darkBlack/10 text-left hover:border-darkAqua transition-colors">
            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
              <card.icon className={`h-6 w-6 ${card.color}`} />
            </div>
            <h3 className="font-semibold text-text mb-1">{card.title}</h3>
            <p className="text-sm text-darkBlack/50">{card.desc}</p>
          </motion.button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <h2 className="text-lg font-semibold text-text mb-6">Audit Log</h2>
        {logsLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : auditLogs.length === 0 ? (
          <p className="text-center text-darkBlack/40 py-8">No compliance actions yet</p>
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
      </motion.div>

      {modalAction && activeCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setModalAction(null)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${activeCard.bg} flex items-center justify-center`}>
                  <activeCard.icon className={`h-5 w-5 ${activeCard.color}`} />
                </div>
                <h2 className="text-xl font-semibold text-text">{activeCard.title}</h2>
              </div>
              <button onClick={() => setModalAction(null)} className="p-2 hover:bg-box rounded-xl">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Input label="Target Address" value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)} placeholder="0x..." />
              {(modalAction === "forced_transfer" || modalAction === "recover") && (
                <>
                  <Input label="Token ID" value={selectedToken}
                    onChange={(e) => setSelectedToken(e.target.value)} placeholder="Token ID" />
                  <Input label="Amount" type="number" value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </>
              )}
              {modalAction === "forced_transfer" && (
                <Input label="Destination Address" value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)} placeholder="0x..." />
              )}
              <Input label="Reason" value={reason}
                onChange={(e) => setReason(e.target.value)} placeholder="Regulatory order #..." />
            </div>
            <div className="flex gap-4 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setModalAction(null)}>Cancel</Button>
              <Button variant="primary" className="flex-1" onClick={handleSubmit}
                disabled={isSubmitting || !targetAddress || !reason}>
                {isSubmitting ? <Spinner size="sm" /> : "Confirm"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </IssuerDashboardLayout>
  );
}
