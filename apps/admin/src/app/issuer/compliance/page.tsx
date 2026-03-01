"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Lock,
  Unlock,
  ArrowRightLeft,
  RefreshCw,
  AlertTriangle,
  Search,
  X,
} from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/atoms";
import { AuditLogRow } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";

const MOCK_AUDIT_LOGS = [
  { action: "freeze" as const, actorWallet: "0x1234567890abcdef1234567890abcdef12345678", targetWallet: "0xabcdef1234567890abcdef1234567890abcdef12", targetType: "WAGR", timestamp: "2024-03-01T10:30:00Z", details: "Suspected fraudulent activity" },
  { action: "unfreeze" as const, actorWallet: "0x1234567890abcdef1234567890abcdef12345678", targetWallet: "0x9876543210fedcba9876543210fedcba98765432", targetType: "WAGR", timestamp: "2024-02-28T14:15:00Z", details: "Investigation complete" },
  { action: "forced_transfer" as const, actorWallet: "0x1234567890abcdef1234567890abcdef12345678", targetWallet: "0xfedcba9876543210fedcba9876543210fedcba98", targetType: "CFQ2", timestamp: "2024-02-25T09:00:00Z", details: "Court order compliance" },
  { action: "recover" as const, actorWallet: "0x1234567890abcdef1234567890abcdef12345678", targetWallet: "0x5678901234abcdef5678901234abcdef56789012", targetType: "WAGR", timestamp: "2024-02-20T16:45:00Z", details: "Lost key recovery request" },
];

const TOKENS = [
  { value: "wagr", label: "West African Gold Reserve (WAGR)" },
  { value: "cfq2", label: "Copper Futures Q2 (CFQ2)" },
];

type ModalAction = "freeze" | "unfreeze" | "forced_transfer" | "recover" | null;

export default function CompliancePage() {
  const [activeTab, setActiveTab] = useState<"actions" | "logs">("actions");
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [selectedToken, setSelectedToken] = useState("wagr");
  const [targetAddress, setTargetAddress] = useState("");
  const [reason, setReason] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSubmitting(false);
    setModalAction(null);
    setTargetAddress("");
    setReason("");
    setDestinationAddress("");
    setAmount("");
  };

  const actionCards = [
    {
      action: "freeze" as const,
      icon: Lock,
      title: "Freeze Address",
      description: "Prevent an address from transferring tokens",
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
    {
      action: "unfreeze" as const,
      icon: Unlock,
      title: "Unfreeze Address",
      description: "Re-enable transfers for a frozen address",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      action: "forced_transfer" as const,
      icon: ArrowRightLeft,
      title: "Forced Transfer",
      description: "Transfer tokens from one address to another",
      color: "text-gold",
      bgColor: "bg-gold/10",
    },
    {
      action: "recover" as const,
      icon: RefreshCw,
      title: "Recover Tokens",
      description: "Recover tokens from a lost or compromised wallet",
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
  ];

  return (
    <IssuerDashboardLayout
      title="Compliance Management"
      description="Manage token compliance actions and view audit logs"
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setActiveTab("actions")}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === "actions"
              ? "bg-darkAqua text-white"
              : "bg-white text-gray-500 hover:text-text border border-darkBlack/10"
          }`}
        >
          <Shield className="h-4 w-4 inline mr-2" />
          Actions
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === "logs"
              ? "bg-darkAqua text-white"
              : "bg-white text-gray-500 hover:text-text border border-darkBlack/10"
          }`}
        >
          Audit Logs
        </button>
      </div>

      {activeTab === "actions" && (
        <>
          {/* Token Selector */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
          >
            <div className="max-w-md">
              <Select
                label="Select Token"
                options={TOKENS}
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
              />
            </div>
          </motion.div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {actionCards.map((card, index) => (
              <motion.button
                key={card.action}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => setModalAction(card.action)}
                className="bg-white rounded-3xl p-6 border border-darkBlack/10 text-left hover:shadow-card transition-shadow group"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl ${card.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <card.icon className={`h-7 w-7 ${card.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-text mb-1">{card.title}</h3>
                    <p className="text-sm text-gray-500">{card.description}</p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Warning */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gold text-sm">Important Notice</p>
              <p className="text-sm text-gray-600 mt-1">
                All compliance actions are permanently logged and cannot be undone.
                Ensure you have proper authorization before proceeding.
              </p>
            </div>
          </motion.div>
        </>
      )}

      {activeTab === "logs" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-text">Audit Log</h3>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  className="input-field pl-10 py-2 text-sm"
                />
              </div>
              <Select
                options={[
                  { value: "all", label: "All Actions" },
                  { value: "freeze", label: "Freeze" },
                  { value: "unfreeze", label: "Unfreeze" },
                  { value: "forced_transfer", label: "Forced Transfer" },
                  { value: "recover", label: "Recover" },
                ]}
              />
            </div>
          </div>

          <div className="space-y-3">
            {MOCK_AUDIT_LOGS.map((log, index) => (
              <AuditLogRow key={index} {...log} index={index} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Action Modal */}
      <AnimatePresence>
        {modalAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setModalAction(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-lg w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text capitalize">
                  {modalAction.replace("_", " ")}
                </h2>
                <button
                  onClick={() => setModalAction(null)}
                  className="p-2 hover:bg-box rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <Input
                  label="Target Address"
                  placeholder="0x..."
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                />

                {(modalAction === "forced_transfer" || modalAction === "recover") && (
                  <>
                    <Input
                      label="Destination Address"
                      placeholder="0x..."
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                    />
                    <Input
                      label="Amount"
                      type="number"
                      placeholder="Token amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </>
                )}

                <Textarea
                  label="Reason"
                  placeholder="Provide a detailed reason for this action..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />

                <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">
                    <strong>Warning:</strong> This action will be logged permanently and
                    may require regulatory documentation.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1" onClick={() => setModalAction(null)}>
                  Cancel
                </Button>
                <Button
                  variant={modalAction === "freeze" || modalAction === "forced_transfer" ? "danger" : "primary"}
                  className="flex-1"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                  disabled={!targetAddress || !reason}
                >
                  Confirm Action
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IssuerDashboardLayout>
  );
}
