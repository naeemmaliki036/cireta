"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button, Input, Textarea } from "@/components/atoms";

type ModalType = "approve" | "fee" | "revoke" | null;

interface Props {
  modalType: ModalType;
  issuerName: string;
  feeBps: number;
  newFee: string;
  revokeReason: string;
  isSubmitting: boolean;
  onNewFeeChange: (v: string) => void;
  onRevokeReasonChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function IssuerActionModal({
  modalType, issuerName, feeBps, newFee, revokeReason, isSubmitting,
  onNewFeeChange, onRevokeReasonChange, onConfirm, onClose,
}: Props) {
  return (
    <AnimatePresence>
      {modalType && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text">
                {modalType === "approve" && "Approve Issuer"}
                {modalType === "fee" && "Update Fee"}
                {modalType === "revoke" && "Revoke Issuer"}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-box rounded-xl"><X className="h-5 w-5" /></button>
            </div>

            {modalType === "approve" && (
              <div>
                <p className="text-darkBlack/60 mb-6">Approve <strong>{issuerName}</strong> as a verified issuer?</p>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                  <Button variant="primary" className="flex-1" onClick={onConfirm} disabled={isSubmitting} >Approve</Button>
                </div>
              </div>
            )}

            {modalType === "fee" && (
              <div>
                <p className="text-sm text-darkBlack/60 mb-4">Current: {feeBps} bps ({(feeBps / 100).toFixed(2)}%)</p>
                <Input label="New Fee (basis points)" type="number" value={newFee}
                  onChange={(e) => onNewFeeChange(e.target.value)} placeholder="200" className="mb-4" />
                <p className="text-xs text-darkBlack/40 mb-6">{newFee} bps = {(parseInt(newFee || "0") / 100).toFixed(2)}%</p>
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                  <Button variant="primary" className="flex-1" onClick={onConfirm} disabled={isSubmitting} >Update Fee</Button>
                </div>
              </div>
            )}

            {modalType === "revoke" && (
              <div>
                <p className="text-darkBlack/60 mb-4">Revoke <strong>{issuerName}</strong>? This suspends all tokens.</p>
                <Textarea label="Reason" value={revokeReason}
                  onChange={(e) => onRevokeReasonChange(e.target.value)} placeholder="Reason for revocation…" className="mb-6" />
                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                  <Button variant="primary" className="flex-1 !bg-red-500" onClick={onConfirm} disabled={isSubmitting} >Revoke</Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
