"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { User, FileText, ShieldCheck, Wallet, ArrowRight, X, BellOff, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useKYC } from "@/contexts/KYCContext";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/api/repositories/auth.repository";

const STEPS = [
  {
    key: "type",
    icon: User,
    title: "Choose Investor Type",
    desc: "Individual or corporate — determines your verification path",
    color: "bg-blue-50 text-blue-600",
    doneColor: "bg-green-50 text-green-600",
  },
  {
    key: "details",
    icon: FileText,
    title: "Basic Information",
    desc: "Name, date of birth, nationality or company details",
    color: "bg-amber-50 text-amber-600",
    doneColor: "bg-green-50 text-green-600",
  },
  {
    key: "kyc",
    icon: ShieldCheck,
    title: "Identity Verification",
    desc: "Quick KYC (individuals) or KYB (corporates) — usually under 5 min",
    color: "bg-emerald-50 text-emerald-600",
    doneColor: "bg-green-50 text-green-600",
  },
  {
    key: "wallet",
    icon: Wallet,
    title: "Connect Wallet",
    desc: "Link an EVM wallet for on-chain investments (optional)",
    color: "bg-purple-50 text-purple-600",
    doneColor: "bg-green-50 text-green-600",
    optional: true,
  },
];

export function WelcomeModal() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { kycStatus } = useKYC();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (user.onboarding_completed) return;

    const permanentKey = `cireta_welcome_dismissed_${user.id}`;
    if (localStorage.getItem(permanentKey)) return;

    const sessionKey = `cireta_welcome_later_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    // Fetch onboarding status then show
    (async () => {
      try {
        const data = await getOnboardingStatus();
        setStatus(data);
      } catch { /* ignore */ }
      setTimeout(() => setIsOpen(true), 800);
    })();
  }, [isLoading, isAuthenticated, user]);

  const handleRemindLater = () => {
    if (user) sessionStorage.setItem(`cireta_welcome_later_${user.id}`, "1");
    setIsOpen(false);
  };

  const handleDontRemind = () => {
    if (user) localStorage.setItem(`cireta_welcome_dismissed_${user.id}`, "1");
    setIsOpen(false);
  };

  const isStepDone = (key: string) => status?.steps[key]?.completed ?? false;
  const completedCount = status ? Object.values(status.steps).filter((s) => s.completed).length : 0;
  const totalSteps = STEPS.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleRemindLater}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg mx-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="relative bg-gradient-to-br from-[#13636F] to-[#0a3a42] px-8 pt-8 pb-10 text-white">
                <button
                  onClick={handleRemindLater}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2.5 mb-3">
                  <Image src="/images/logo/cireta-icon-white.png" alt="" width={28} height={28} className="h-7 w-7 opacity-80" />
                  <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Welcome to Cireta</span>
                </div>

                <h2 className="text-2xl font-bold mb-2">
                  Hi{user?.display_name ? `, ${user.display_name.split(" ")[0]}` : ""}!
                </h2>
                <p className="text-sm text-white/70 leading-relaxed">
                  {completedCount > 0
                    ? `You've completed ${completedCount} of ${totalSteps} steps. Keep going to unlock investing.`
                    : "Your account is created. Complete a few quick steps to start investing in tokenized real-world assets."}
                </p>

                {/* Progress bar */}
                {status && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                      <span>Progress</span>
                      <span>{completedCount}/{totalSteps} steps</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(completedCount / totalSteps) * 100}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full bg-white/60 rounded-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="px-8 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">What&apos;s next</p>
                <div className="space-y-3">
                  {STEPS.map((step, i) => {
                    const done = isStepDone(step.key);
                    const isKycPending = step.key === "kyc" && !done && kycStatus.status === "pending";
                    return (
                      <div key={step.title} className={`flex items-start gap-3.5 ${done ? "opacity-60" : ""}`}>
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-xl ${
                            done ? step.doneColor
                            : isKycPending ? "bg-amber-50 text-amber-600"
                            : step.color
                          } flex items-center justify-center`}>
                            {done
                              ? <CheckCircle2 className="h-5 w-5" />
                              : isKycPending
                              ? <Clock className="h-5 w-5" />
                              : <step.icon className="h-5 w-5" />}
                          </div>
                        </div>
                        <div className="pt-0.5">
                          <div className="flex items-center gap-2">
                            {done ? (
                              <span className="text-[10px] font-bold text-green-500">COMPLETED</span>
                            ) : isKycPending ? (
                              <span className="text-[10px] font-bold text-amber-500">IN REVIEW</span>
                            ) : (
                              <span className="text-[10px] font-bold text-gray-300">STEP {i + 1}</span>
                            )}
                            {step.optional && !done && (
                              <span className="text-[9px] font-medium text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">OPTIONAL</span>
                            )}
                          </div>
                          <p className={`text-sm font-semibold ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>{step.title}</p>
                          {!done && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {isKycPending
                                ? "Your documents are being reviewed. This usually takes a few minutes."
                                : step.desc}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="px-8 pb-6">
                <Link
                  href="/onboarding"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white font-semibold py-3.5 rounded-xl hover:bg-gray-800 transition-colors text-sm"
                >
                  {completedCount > 0 ? "Continue" : "Get Started"} <ArrowRight className="h-4 w-4" />
                </Link>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={handleRemindLater}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                  >
                    Remind me later
                  </button>
                  <button
                    onClick={handleDontRemind}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                  >
                    <BellOff className="h-3 w-3" />
                    Don&apos;t show again
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
