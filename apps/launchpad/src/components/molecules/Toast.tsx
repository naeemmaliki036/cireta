"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, X, AlertTriangle, Info } from "lucide-react";

export interface ToastData {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastData;
  onRemove: (id: string) => void;
}

function Toast({ toast, onRemove }: ToastProps) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const styles = {
    success: "bg-darkAqua/10 border-darkAqua/20 text-darkAqua",
    error: "bg-white border-text/20 text-text",
    warning: "bg-box border-black/10 text-text",
    info: "bg-box border-black/10 text-text",
  };

  const Icon = icons[toast.type];

  useEffect(() => {
    const duration = toast.duration ?? (toast.type === "error" ? 8000 : 4000);
    const timer = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, toast.type, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.9 }}
      className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-md backdrop-blur-sm ${styles[toast.type]}`}
    >
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-xs mt-1 opacity-90 break-words">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 ml-2 p-1 rounded-lg hover:bg-black/10 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = (toast: Omit<ToastData, "id">) => {
    const id = Math.random().toString(36).substring(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showError = (title: string, message?: string) => {
    showToast({ type: "error", title, message });
  };

  const showSuccess = (title: string, message?: string) => {
    showToast({ type: "success", title, message });
  };

  const showWarning = (title: string, message?: string) => {
    showToast({ type: "warning", title, message });
  };

  const showInfo = (title: string, message?: string) => {
    showToast({ type: "info", title, message });
  };

  return {
    toasts,
    showToast,
    removeToast,
    showError,
    showSuccess,
    showWarning,
    showInfo,
  };
}