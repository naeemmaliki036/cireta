"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button, Input, Textarea } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";

type ModalType = "approve" | "fee" | "revoke" | "reactivate" | null;

interface OnChainTxState {
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  txHash: string | null;
  txUrl: string | null;
  error: string | null;
}

interface Props {
  modalType: ModalType;
  issuerName: string;
  feeBps: number;
  newFee: string;
  revokeReason: string;
  isSubmitting: boolean;
  /** Whether the issuer is on-chain — shows chain-step UI when true */
  isOnChain?: boolean;
  /** Role warning: shown when wallet lacks ISSUER_MANAGER_ROLE */
  roleWarning?: string | null;
  /** On-chain tx state for suspend flow */
  suspendTxState?: OnChainTxState | null;
  /** On-chain tx state for reactivate flow */
  reactivateTxState?: OnChainTxState | null;
  onNewFeeChange: (v: string) => void;
  onRevokeReasonChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function IssuerActionModal({
  modalType, issuerName, feeBps, newFee, revokeReason, isSubmitting,
  isOnChain, roleWarning, suspendTxState, reactivateTxState,
  onNewFeeChange, onRevokeReasonChange, onConfirm, onClose,
}: Props) {
  const isTxInFlight =
    suspendTxState?.isPending || suspendTxState?.isConfirming ||
    reactivateTxState?.isPending || reactivateTxState?.isConfirming;

  const isChainConfirmed =
    suspendTxState?.isConfirmed || reactivateTxState?.isConfirmed;

  return (
    <AnimatePresence>
      {modalType && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text">
                {modalType === "approve" && "Approve Issuer"}
                {modalType === "fee" && "Update Fee"}
                {modalType === "revoke" && "Suspend Issuer"}
                {modalType === "reactivate" && "Reactivate Issuer"}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-box rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            {roleWarning && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <span className="font-semibold shrink-0">Warning:</span>
                <span>{roleWarning}</span>
              </div>
            )}

            {modalType === "approve" && (
              <div>
                <p className="text-black/60 mb-6">
                  Approve <strong>{issuerName}</strong> as a verified issuer?
                </p>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={onConfirm}
                    disabled={isSubmitting}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            )}

            {modalType === "fee" && (
              <div>
                <p className="text-sm text-black/60 mb-4">
                  Current: {feeBps} bps ({(feeBps / 100).toFixed(2)}%)
                </p>
                <Input
                  label="New Fee (basis points)"
                  type="number"
                  value={newFee}
                  onChange={(e) => onNewFeeChange(e.target.value)}
                  placeholder="200"
                  className="mb-4"
                />
                <p className="text-xs text-black/40 mb-6">
                  {newFee} bps = {(parseInt(newFee || "0") / 100).toFixed(2)}%
                </p>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={onConfirm}
                    disabled={isSubmitting}
                  >
                    Update Fee
                  </Button>
                </div>
              </div>
            )}

            {modalType === "revoke" && (
              <div>
                <p className="text-black/60 mb-4">
                  Suspend <strong>{issuerName}</strong>? This suspends all tokens.
                </p>
                {isOnChain && (
                  <p className="text-xs text-zinc-500 mb-3 bg-zinc-50 border border-zinc-200 rounded px-3 py-2">
                    This issuer is registered on-chain. After the database update, a
                    second transaction will call{" "}
                    <code className="font-mono text-[11px]">suspendIssuer</code> on
                    the IssuerRegistry contract.
                  </p>
                )}
                <Textarea
                  label="Reason"
                  value={revokeReason}
                  onChange={(e) => onRevokeReasonChange(e.target.value)}
                  placeholder="Reason for suspension…"
                  className="mb-4"
                />
                {suspendTxState && (
                  <TransactionStatus
                    isPending={suspendTxState.isPending}
                    isConfirming={suspendTxState.isConfirming}
                    isConfirmed={suspendTxState.isConfirmed}
                    txHash={suspendTxState.txHash}
                    txUrl={suspendTxState.txUrl}
                    error={suspendTxState.error}
                    successMessage="Issuer suspended on-chain"
                  />
                )}
                <div className="flex gap-4 mt-6">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 !bg-red-500"
                    onClick={onConfirm}
                    disabled={isSubmitting || isTxInFlight || isChainConfirmed}
                  >
                    {isSubmitting ? "Suspending…" : isTxInFlight ? "On-chain…" : "Suspend"}
                  </Button>
                </div>
              </div>
            )}

            {modalType === "reactivate" && (
              <div>
                <p className="text-black/60 mb-4">
                  Reactivate <strong>{issuerName}</strong>? Their tokens will resume
                  normal operation.
                </p>
                {isOnChain && (
                  <p className="text-xs text-zinc-500 mb-3 bg-zinc-50 border border-zinc-200 rounded px-3 py-2">
                    This issuer is registered on-chain. After the database update, a
                    second transaction will call{" "}
                    <code className="font-mono text-[11px]">reactivateIssuer</code>{" "}
                    on the IssuerRegistry contract.
                  </p>
                )}
                {reactivateTxState && (
                  <TransactionStatus
                    isPending={reactivateTxState.isPending}
                    isConfirming={reactivateTxState.isConfirming}
                    isConfirmed={reactivateTxState.isConfirmed}
                    txHash={reactivateTxState.txHash}
                    txUrl={reactivateTxState.txUrl}
                    error={reactivateTxState.error}
                    successMessage="Issuer reactivated on-chain"
                  />
                )}
                <div className="flex gap-4 mt-6">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={onConfirm}
                    disabled={isSubmitting || isTxInFlight || isChainConfirmed}
                  >
                    {isSubmitting
                      ? "Reactivating…"
                      : isTxInFlight
                      ? "On-chain…"
                      : "Reactivate"}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
