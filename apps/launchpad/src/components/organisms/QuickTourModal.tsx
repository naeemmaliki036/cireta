"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, UserPlus, Wallet, ShieldCheck, Coins, ArrowRight } from "lucide-react";
import { CiretaLogo } from "@/components/atoms";

const STEPS = [
  {
    icon: Play,
    title: "Learn the Basics",
    description: "Watch quick guides on how to use the Launchpad.",
  },
  {
    icon: UserPlus,
    title: "Sign Up",
    description: "Register with your email to get started.",
  },
  {
    icon: Wallet,
    title: "Connect your wallet",
    description: "Choose your preferred wallet to get started.",
  },
  {
    icon: ShieldCheck,
    title: "Get Verified (KYC/KYB)",
    description: "Complete identity or business verification to start.",
  },
  {
    icon: Coins,
    title: "Buy Token",
    description: 'Buy token via "Crypto" or "OTC & Bank"',
  },
];

export function QuickTourModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem("cireta_tour_seen");
    if (!seen) {
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener("open-quick-tour", handler);
    return () => window.removeEventListener("open-quick-tour", handler);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("cireta_tour_seen", "1");
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-xl p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-text">Hey, Let&apos;s take a quick tour!</h2>
                <p className="text-sm text-gray-500 mt-1">Get started with a quick tour to discover the new Cireta launchpad</p>
              </div>
              <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <CiretaLogo variant="icon" color="teal" className="w-6 h-6" />
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-1">
              {STEPS.map((step, i) => {
                const isActive = i === currentStep;
                const isPast = i < currentStep;
                return (
                  <div key={step.title} className="flex items-start gap-3">
                    {/* Connector line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? "bg-darkAqua text-white" : isPast ? "bg-darkAqua/20 text-darkAqua" : "bg-gray-100 text-gray-400"
                      }`}>
                        <step.icon className="h-4 w-4" />
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`w-px h-6 ${isPast ? "bg-darkAqua/30" : "bg-gray-200"} border-dashed`} style={{ borderLeft: "2px dashed", borderColor: isPast ? "rgba(19,99,111,0.3)" : "#e5e7eb" }} />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p className={`text-sm font-semibold ${isActive ? "text-text" : "text-gray-400"}`}>{step.title}</p>
                      <p className={`text-xs ${isActive ? "text-gray-500" : "text-gray-300"}`}>{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all ${i === currentStep ? "w-6 bg-darkBlack" : "w-3 bg-gray-200"}`} />
                ))}
              </div>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 bg-darkBlack text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-darkBlack/90 transition-colors"
              >
                {currentStep < STEPS.length - 1 ? "Next" : "Get Started"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
